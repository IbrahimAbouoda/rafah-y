'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requirePermission, requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { conflict, invalid, notFound } from '@/lib/errors';
import type { InitiativeStatus } from '@/lib/generated/prisma/enums';
import { INITIATIVE_STATUS_LABELS, initiativeTransitionPermission } from '@/lib/initiatives/workflow';
import {
  InitiativeProgressSchema,
  InitiativeSchema,
  InitiativeStatusSchema,
  NeedIdSchema,
  NeedSchema,
  PostUpdateSchema,
} from '@/lib/validation/initiatives';

// المبادرات — PRD §5.3 · AC-09. «مبادرة تتبع لجنتي» ⇒ النطاق هو committeeId المبادرة.

async function load(id: string) {
  const initiative = await db.initiative.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true, status: true, committeeId: true },
  });
  if (!initiative) throw notFound('المبادرة');
  return initiative;
}

function revalidateInitiative(i: { id: string; slug: string }) {
  revalidatePath('/admin/initiatives');
  revalidatePath(`/admin/initiatives/${i.id}`);
  revalidatePath('/initiatives');
  revalidatePath(`/initiatives/${i.slug}`);
  revalidatePath('/support');
  revalidatePath('/partner/needs');
}

/** معرّف قصير للرابط العام — العناوين عربية، والرقم المرجعي خاص بالشكاوى والأفكار والقرارات */
const newSlug = () => `m-${new Date().getFullYear()}-${randomBytes(4).toString('hex')}`;

/** إنشاء (initiatives:create) أو تعديل البيانات (initiatives:update) */
export async function saveInitiativeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const raw = formToObject(form);
    const key = raw.id ? 'initiatives:update' : 'initiatives:create';
    requirePermission(user, key);
    const data = InitiativeSchema.parse(raw);
    if (data.startsAt && data.endsAt && data.endsAt < data.startsAt) {
      throw invalid('تاريخ النهاية قبل البداية.', { endsAt: ['قبل تاريخ البداية.'] });
    }
    const committee = await db.committee.findFirst({ where: { id: data.committeeId, isActive: true }, select: { id: true } });
    if (!committee) throw invalid('اللجنة غير موجودة أو معطّلة.', { committeeId: ['اختر لجنة نشطة.'] });
    requirePermission(user, key, { committeeId: committee.id });

    const fields = {
      title: data.title,
      summary: data.summary ?? null,
      description: data.description ?? null,
      committeeId: committee.id,
      estimatedBudget: data.estimatedBudget ?? null,
      beneficiariesTarget: data.beneficiariesTarget ?? null,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
    };

    if (data.id) {
      const current = await load(data.id);
      // التعديل على لجنة المبادرة الحالية، ونقلها إلى لجنة أخرى يحتاج الصلاحية على الاثنتين
      requirePermission(user, 'initiatives:update', { committeeId: current.committeeId });
      if (current.status === 'COMPLETED' || current.status === 'CANCELLED') {
        throw conflict('المبادرة مكتملة أو ملغاة ولا تُعدَّل.');
      }
      await db.initiative.update({ where: { id: current.id }, data: fields });
      revalidateInitiative(current);
      return 'حُفظت المبادرة.';
    }

    let ideaId: string | null = null;
    if (data.ideaId) {
      const idea = await db.idea.findUnique({ where: { id: data.ideaId }, select: { status: true, initiativeId: true } });
      if (!idea) throw notFound('الفكرة');
      if (idea.status !== 'APPROVED') throw invalid('تتحول إلى مبادرة الفكرةُ المعتمدة فقط.');
      if (idea.initiativeId) throw conflict('هذه الفكرة تحولت إلى مبادرة من قبل.');
      ideaId = data.ideaId;
    }

    const created = await db.$transaction(async (tx) => {
      const initiative = await tx.initiative.create({
        data: { ...fields, slug: newSlug(), createdById: user.id },
        select: { id: true, slug: true },
      });
      if (ideaId) await tx.idea.update({ where: { id: ideaId }, data: { initiativeId: initiative.id } });
      return initiative;
    });
    revalidateInitiative(created);
    return 'أُنشئت المبادرة مسودةً. أضف احتياجاتها المرقّمة ثم أرسلها لاعتماد الرئيس.';
  });
}

/** انتقال في المسار — الصلاحية من جدول الانتقالات، والنشر (initiative.approve) للرئيس وحده */
export async function setInitiativeStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const raw = formToObject(form);
    const data = InitiativeStatusSchema.parse(raw);
    const initiative = await load(data.initiativeId);
    const key = initiativeTransitionPermission(initiative.status, data.toStatus);
    if (!key) {
      throw invalid(
        `لا يمكن نقل المبادرة من «${INITIATIVE_STATUS_LABELS[initiative.status]}» إلى «${INITIATIVE_STATUS_LABELS[data.toStatus]}».`,
      );
    }
    requirePermission(user, key, { committeeId: initiative.committeeId });

    if (data.toStatus === 'PENDING_APPROVAL') {
      const needs = await db.initiativeNeed.count({ where: { initiativeId: initiative.id, status: { not: 'CANCELLED' } } });
      if (needs === 0) throw invalid('أضف احتياجًا مرقّمًا واحدًا على الأقل قبل طلب الاعتماد.');
    }

    const publishing = data.toStatus === 'PUBLISHED';
    await db.$transaction(async (tx) => {
      const { count } = await tx.initiative.updateMany({
        where: { id: initiative.id, status: initiative.status },
        data: {
          status: data.toStatus as InitiativeStatus,
          ...(publishing ? { approvedById: user.id, approvedAt: new Date() } : {}),
        },
      });
      if (count === 0) throw conflict('تغيّرت حالة المبادرة للتو. حدّث الصفحة.');
      if (publishing) {
        await writeAudit(tx, user, 'initiative.approve', 'Initiative', initiative.id, { status: initiative.status }, {
          status: data.toStatus,
          approvedById: user.id,
        });
      }
    });
    revalidateInitiative(initiative);
    return publishing
      ? 'اعتُمدت المبادرة ونُشرت، واحتياجاتها ظاهرة الآن في «ادعمنا».'
      : `المبادرة الآن: ${INITIATIVE_STATUS_LABELS[data.toStatus]}.`;
  });
}

/** نسبة الإنجاز والأثر — initiatives:update. قيد 0–100 في قاعدة البيانات أيضًا */
export async function updateProgressAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'initiatives:update');
    const data = InitiativeProgressSchema.parse(formToObject(form));
    const initiative = await load(data.initiativeId);
    requirePermission(user, 'initiatives:update', { committeeId: initiative.committeeId });
    await db.initiative.update({
      where: { id: initiative.id },
      data: {
        progressPct: data.progressPct,
        beneficiariesReached: data.beneficiariesReached ?? null,
        impactSummary: data.impactSummary ?? null,
      },
    });
    revalidateInitiative(initiative);
    return `نسبة الإنجاز الآن ${data.progressPct}٪.`;
  });
}

// ─── الاحتياجات المرقّمة (need.change) ────────────────────────────────

export async function upsertNeedAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'initiatives:manage_needs');
    const data = NeedSchema.parse(formToObject(form));
    const initiative = await load(data.initiativeId);
    requirePermission(user, 'initiatives:manage_needs', { committeeId: initiative.committeeId });
    if (initiative.status === 'COMPLETED' || initiative.status === 'CANCELLED') {
      throw conflict('المبادرة مكتملة أو ملغاة ولا تُعدَّل احتياجاتها.');
    }
    const fields = {
      type: data.type,
      description: data.description,
      quantity: data.quantity ?? null,
      unit: data.unit ?? null,
      amount: data.amount ?? null,
      sortOrder: data.sortOrder,
    };

    await db.$transaction(async (tx) => {
      if (data.needId) {
        const before = await tx.initiativeNeed.findFirst({ where: { id: data.needId, initiativeId: initiative.id } });
        if (!before) throw notFound('الاحتياج');
        const after = await tx.initiativeNeed.update({ where: { id: before.id }, data: fields });
        await writeAudit(tx, user, 'need.change', 'InitiativeNeed', after.id, before, after);
      } else {
        const created = await tx.initiativeNeed.create({ data: { ...fields, initiativeId: initiative.id } });
        await writeAudit(tx, user, 'need.change', 'InitiativeNeed', created.id, null, created);
      }
    });
    revalidateInitiative(initiative);
    return data.needId ? 'حُفظ الاحتياج.' : 'أُضيف الاحتياج.';
  });
}

/** إزالة الاحتياج = إلغاؤه (لا حذف): عروض سابقة قد ترتبط به */
export async function removeNeedAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'initiatives:manage_needs');
    const { needId } = NeedIdSchema.parse(formToObject(form));
    const need = await db.initiativeNeed.findUnique({
      where: { id: needId },
      include: { initiative: { select: { id: true, slug: true, committeeId: true } } },
    });
    if (!need) throw notFound('الاحتياج');
    requirePermission(user, 'initiatives:manage_needs', { committeeId: need.initiative.committeeId });
    if (need.status === 'COVERED') throw conflict('الاحتياج مغطّى بعرض مقبول ولا يُلغى.');

    await db.$transaction(async (tx) => {
      const after = await tx.initiativeNeed.update({ where: { id: need.id }, data: { status: 'CANCELLED' } });
      await writeAudit(tx, user, 'need.change', 'InitiativeNeed', need.id, { status: need.status }, { status: after.status });
    });
    revalidateInitiative(need.initiative);
    return 'أُلغي الاحتياج.';
  });
}

/** تحديث ميداني عام أو داخلي — initiatives:post_update (لجنة، يشمل العضو) */
export async function postUpdateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'initiatives:post_update');
    const data = PostUpdateSchema.parse(formToObject(form));
    const initiative = await load(data.initiativeId);
    requirePermission(user, 'initiatives:post_update', { committeeId: initiative.committeeId });
    await db.initiativeUpdate.create({
      data: { initiativeId: initiative.id, authorId: user.id, body: data.body, isPublic: data.isPublic },
    });
    revalidateInitiative(initiative);
    return data.isPublic ? 'نُشر التحديث على صفحة المبادرة.' : 'أُضيف التحديث الداخلي.';
  });
}
