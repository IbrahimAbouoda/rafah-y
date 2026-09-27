'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission, requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import {
  ACTIVITY_STATUS_LABELS,
  attendanceBlocker,
  canMoveActivity,
  canRate,
  MARKABLE,
  registerBlocker,
  registrationStatusFor,
  SEAT_HOLDING,
} from '@/lib/activities/workflow';
import { db } from '@/lib/db';
import { conflict, invalid, notFound } from '@/lib/errors';
import { Prisma } from '@/lib/generated/prisma/client';
import { ActivityIdSchema, ActivitySchema, ActivityStatusSchema, AttendanceSchema, RateSchema } from '@/lib/validation/opportunities';

// الأنشطة — PRD §5.5 · AC-13. كل نشاط تتبعه لجنة (D34)، والصلاحيات بنطاق لجنته.

function revalidateActivities(id?: string) {
  revalidatePath('/activities');
  revalidatePath('/admin/activities');
  if (id) {
    revalidatePath(`/activities/${id}`);
    revalidatePath(`/admin/activities/${id}/attendance`);
  }
}

/** activities:create (جديد) · activities:update (تعديل) — بنطاق اللجنة القديمة والجديدة معًا */
export async function saveActivityAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const raw = formToObject(form);
    const editing = !!raw.id;
    requirePermission(user, editing ? 'activities:update' : 'activities:create');
    const data = ActivitySchema.parse({ ...raw, partnerIds: form.getAll('partnerIds') });

    if (data.id) {
      const current = await db.activity.findUnique({ where: { id: data.id }, select: { committeeId: true, status: true } });
      if (!current) throw notFound('النشاط');
      requirePermission(user, 'activities:update', { committeeId: current.committeeId });
      if (current.status === 'COMPLETED' || current.status === 'CANCELLED') {
        // المخرجات تُوثَّق بعد الانتهاء (§5.5) — ولا يُغيَّر غيرها
        if (current.committeeId !== data.committeeId) throw conflict('النشاط منتهٍ أو ملغى، فلا تُغيَّر لجنته.');
      }
    }
    requirePermission(user, editing ? 'activities:update' : 'activities:create', { committeeId: data.committeeId });

    if (data.partnerIds.length && (await db.organization.count({ where: { id: { in: data.partnerIds } } })) !== data.partnerIds.length) {
      throw invalid('بعض المؤسسات لم تعد موجودة. حدّث الصفحة واختر من جديد.');
    }
    if (data.areaId && !(await db.area.findUnique({ where: { id: data.areaId }, select: { id: true } }))) {
      throw invalid('المنطقة غير متاحة.', { areaId: ['اختر المنطقة من القائمة.'] });
    }

    const fields = {
      committeeId: data.committeeId,
      title: data.title,
      description: data.description ?? null,
      kind: data.kind,
      startsAt: data.startsAt,
      endsAt: data.endsAt ?? null,
      location: data.location ?? null,
      areaId: data.areaId ?? null,
      seats: data.seats ?? null,
      registrationOpen: data.registrationOpen,
      outcomes: data.outcomes ?? null,
    };
    const id = await db.$transaction(async (tx) => {
      const activity = data.id
        ? await tx.activity.update({ where: { id: data.id }, data: fields, select: { id: true } })
        : await tx.activity.create({ data: { ...fields, createdById: user.id, status: 'DRAFT' }, select: { id: true } });
      await tx.activityPartner.deleteMany({ where: { activityId: activity.id, organizationId: { notIn: data.partnerIds } } });
      await tx.activityPartner.createMany({
        data: data.partnerIds.map((organizationId) => ({ activityId: activity.id, organizationId })),
        skipDuplicates: true,
      });
      return activity.id;
    });
    revalidateActivities(id);
    return editing ? 'حُفظ النشاط.' : 'أُنشئ النشاط مسودة. انشره حين يكتمل ليظهر للشباب.';
  });
}

/** activities:update — النشر والإنهاء والإلغاء من lib/activities/workflow.ts وحده */
export async function setActivityStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'activities:update');
    const data = ActivityStatusSchema.parse(formToObject(form));
    const activity = await db.activity.findUnique({ where: { id: data.activityId }, select: { id: true, status: true, committeeId: true } });
    if (!activity) throw notFound('النشاط');
    requirePermission(user, 'activities:update', { committeeId: activity.committeeId });
    if (!canMoveActivity(activity.status, data.toStatus)) {
      throw conflict(`لا يمكن نقل نشاط «${ACTIVITY_STATUS_LABELS[activity.status]}» إلى «${ACTIVITY_STATUS_LABELS[data.toStatus]}».`);
    }
    const { count } = await db.activity.updateMany({ where: { id: activity.id, status: activity.status }, data: { status: data.toStatus } });
    if (count === 0) throw conflict('تغيّرت حالة النشاط للتو. حدّث الصفحة.');
    revalidateActivities(activity.id);
    return `صار النشاط «${ACTIVITY_STATUS_LABELS[data.toStatus]}».`;
  });
}

/**
 * activities:register («خاص») — تسجيل واحد لكل نشاط (AC-13 ②)، و WAITLISTED عند امتلاء المقاعد (AC-13 ①).
 * يُقفل صف النشاط داخل المعاملة فلا يأخذ طلبان متزامنان المقعد الأخير معًا.
 */
export async function registerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'activities:register');
    const { activityId } = ActivityIdSchema.parse(formToObject(form));
    requirePermission(user, 'activities:register', { ownerId: user.id });

    const activity = await db.activity.findUnique({
      where: { id: activityId },
      select: { id: true, status: true, registrationOpen: true, startsAt: true, seats: true },
    });
    if (!activity) throw notFound('النشاط');
    const blocker = registerBlocker(activity);
    if (blocker) throw conflict(blocker);

    const status = await db
      .$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM activities WHERE id = ${activity.id}::uuid FOR UPDATE`;
        const existing = await tx.activityRegistration.findUnique({
          where: { activityId_userId: { activityId: activity.id, userId: user.id } },
          select: { id: true },
        });
        if (existing) throw conflict('سجّلت في هذا النشاط من قبل.');
        const taken = await tx.activityRegistration.count({ where: { activityId: activity.id, status: { in: SEAT_HOLDING } } });
        const next = registrationStatusFor(taken, activity.seats);
        await tx.activityRegistration.create({ data: { activityId: activity.id, userId: user.id, status: next } });
        return next;
      })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw conflict('سجّلت في هذا النشاط من قبل.');
        throw e;
      });
    revalidateActivities(activity.id);
    return status === 'WAITLISTED'
      ? 'امتلأت المقاعد، فأُضفت إلى قائمة الانتظار. نتواصل معك إن فرغ مقعد.'
      : 'سُجّلت في النشاط. نراك في موعده.';
  });
}

/** activities:register — التقييم من الحاضر فقط (AC-13 Security)، والحد 1–5 مضمون بقيد قاعدة البيانات */
export async function rateActivityAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'activities:register');
    const data = RateSchema.parse(formToObject(form));
    const registration = await db.activityRegistration.findUnique({
      where: { activityId_userId: { activityId: data.activityId, userId: user.id } },
      select: { id: true, userId: true, status: true },
    });
    if (!registration) throw notFound('تسجيلك في هذا النشاط');
    requirePermission(user, 'activities:register', { ownerId: registration.userId });
    if (!canRate(registration.status)) throw conflict('التقييم لمن حضر النشاط فقط، بعد أن تسجّل اللجنة حضوره.');
    await db.activityRegistration.update({
      where: { id: registration.id },
      data: { rating: data.rating, feedback: data.feedback ?? null },
    });
    revalidateActivities(data.activityId);
    return 'شكرًا، وصل تقييمك للجنة المنظِّمة.';
  });
}

/** مدخلات الحضور: خانة mark:<registrationId> قيمتها ATTENDED أو NO_SHOW، والفارغة = بلا تغيير */
function marksFrom(form: FormData) {
  const out: { registrationId: string; status: string }[] = [];
  for (const [k, v] of form.entries()) {
    if (k.startsWith('mark:') && typeof v === 'string' && v) out.push({ registrationId: k.slice(5), status: v });
  }
  return out;
}

/** activities:attendance (لجنة النشاط) — الحضور باسم من سجّله ووقته (AC-13 ④) */
export async function markAttendanceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'activities:attendance');
    const data = AttendanceSchema.parse({ activityId: form.get('activityId'), marks: marksFrom(form) });
    const activity = await db.activity.findUnique({ where: { id: data.activityId }, select: { id: true, status: true, startsAt: true, committeeId: true } });
    if (!activity) throw notFound('النشاط');
    requirePermission(user, 'activities:attendance', { committeeId: activity.committeeId });
    const blocker = attendanceBlocker(activity);
    if (blocker) throw conflict(blocker);

    const regs = await db.activityRegistration.findMany({
      where: { activityId: activity.id, id: { in: data.marks.map((m) => m.registrationId) } },
      select: { id: true, status: true },
    });
    const byId = new Map(regs.map((r) => [r.id, r.status]));
    if (regs.length !== data.marks.length) throw invalid('بعض المسجّلين لا ينتمون لهذا النشاط. حدّث الصفحة.');

    const now = new Date();
    let changed = 0;
    await db.$transaction(async (tx) => {
      for (const m of data.marks) {
        const from = byId.get(m.registrationId)!;
        // ما لم يتغيّر يبقى باسم من سجّله أول مرة
        if (!MARKABLE.includes(from) || from === m.status) continue;
        await tx.activityRegistration.update({
          where: { id: m.registrationId },
          data: { status: m.status, attendanceMarkedById: user.id, attendanceMarkedAt: now },
        });
        changed += 1;
      }
    });
    revalidateActivities(activity.id);
    return changed ? `سُجّل حضور ${changed} مشارك باسمك.` : 'لا تغيير: الحالات كما هي.';
  });
}
