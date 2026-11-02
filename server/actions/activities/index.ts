'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission, requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import {
  ACTIVITY_STATUS_LABELS,
  attendanceBlocker,
  canMoveActivity,
  canRate,
  EDITABLE_ACTIVITY_STATUSES,
  FINISHED_ACTIVITY_STATUSES,
  MARKABLE,
  registerBlocker,
  registrationStatusFor,
  SEAT_HOLDING,
} from '@/lib/activities/workflow';
import { db } from '@/lib/db';
import { conflict, invalid, notFound } from '@/lib/errors';
import { Prisma } from '@/lib/generated/prisma/client';
import type { ActivityStatus } from '@/lib/generated/prisma/enums';
import {
  ActivityIdSchema,
  ActivityOutcomesSchema,
  ActivitySchema,
  ActivityStatusSchema,
  AttendanceSchema,
  RateSchema,
} from '@/lib/validation/opportunities';

// الأنشطة — PRD §5.5 · AC-13. كل نشاط تتبعه لجنة (D34)، والصلاحيات بنطاق لجنته.

function revalidateActivities(id?: string) {
  revalidatePath('/activities');
  revalidatePath('/admin/activities');
  if (id) {
    revalidatePath(`/activities/${id}`);
    revalidatePath(`/admin/activities/${id}/attendance`);
  }
}

/**
 * activities:create (جديد) · activities:update (تعديل) — بنطاق اللجنة القديمة والجديدة معًا.
 * النشاط المنتهي أو الملغى تُحدَّث مخرجاته وحدها (§5.5)؛ بقية الحقول والشركاء لا تتغيّر مهما أُرسل.
 */
export async function saveActivityAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const raw = formToObject(form);
    const editing = !!raw.id;
    requirePermission(user, editing ? 'activities:update' : 'activities:create');

    if (editing) {
      const { id } = ActivityOutcomesSchema.pick({ id: true }).parse(raw);
      const current = await db.activity.findUnique({ where: { id }, select: { committeeId: true, status: true } });
      if (!current) throw notFound('النشاط');
      requirePermission(user, 'activities:update', { committeeId: current.committeeId });
      if (FINISHED_ACTIVITY_STATUSES.includes(current.status)) {
        // الحقول المعطّلة في النموذج لا تُرسل أصلًا، فلا يُطبَّق عليها التحقق الكامل
        const { outcomes } = ActivityOutcomesSchema.parse(raw);
        const { count } = await db.activity.updateMany({
          where: { id, status: { in: FINISHED_ACTIVITY_STATUSES } },
          data: { outcomes: outcomes ?? null },
        });
        if (count === 0) throw conflict('تغيّرت حالة النشاط للتو. حدّث الصفحة.');
        revalidateActivities(id);
        return 'النشاط منتهٍ أو ملغى: حُفظت المخرجات وحدها.';
      }
    }

    const data = ActivitySchema.parse({ ...raw, partnerIds: form.getAll('partnerIds') });
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
      let activity: { id: string };
      if (data.id) {
        // انتهى أو أُلغي بين القراءة والحفظ ⇒ لا يُعدَّل
        const { count } = await tx.activity.updateMany({
          where: { id: data.id, status: { in: EDITABLE_ACTIVITY_STATUSES } },
          data: fields,
        });
        if (count === 0) throw conflict('تغيّرت حالة النشاط للتو. حدّث الصفحة.');
        activity = { id: data.id };
      } else {
        activity = await tx.activity.create({ data: { ...fields, createdById: user.id, status: 'DRAFT' }, select: { id: true } });
      }
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
 * يُقفل صف النشاط داخل المعاملة فلا يأخذ طلبان متزامنان المقعد الأخير معًا، ويُعاد الفحص على الصف المقفول:
 * نشاط أُلغي أو أُغلق تسجيله أو غُيّرت مقاعده في اللحظة نفسها لا يقبل التسجيل بحالته القديمة.
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
    // فحص سريع قبل المعاملة؛ الحاسم هو الذي بعد القفل
    const early = registerBlocker(activity);
    if (early) throw conflict(early);

    const status = await db
      .$transaction(async (tx) => {
        const [locked] = await tx.$queryRaw<
          { status: ActivityStatus; registrationOpen: boolean; startsAt: Date; seats: number | null }[]
        >`SELECT status, "registrationOpen", "startsAt", seats FROM activities WHERE id = ${activity.id}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
        if (!locked) throw notFound('النشاط');
        const blocker = registerBlocker(locked);
        if (blocker) throw conflict(blocker);
        const existing = await tx.activityRegistration.findUnique({
          where: { activityId_userId: { activityId: activity.id, userId: user.id } },
          select: { id: true },
        });
        if (existing) throw conflict('سجّلت في هذا النشاط من قبل.');
        const taken = await tx.activityRegistration.count({ where: { activityId: activity.id, status: { in: SEAT_HOLDING } } });
        // المقاعد من الصف المقفول، لا من القراءة الأولى
        const next = registrationStatusFor(taken, locked.seats);
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
    const notAttended = 'التقييم لمن حضر النشاط فقط، بعد أن تسجّل اللجنة حضوره.';
    if (!canRate(registration.status)) throw conflict(notAttended);
    // مشروط بالحالة في نفس الكتابة: عُلِّم «لم يحضر» بين القراءة والحفظ ⇒ لا تقييم
    const { count } = await db.activityRegistration.updateMany({
      where: { id: registration.id, status: 'ATTENDED' },
      data: { rating: data.rating, feedback: data.feedback ?? null },
    });
    if (count === 0) throw conflict(notAttended);
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
        // مشروط بالحالة التي قُرئت: تغيير متزامن من عضو آخر يُلغي المعاملة كلها
        const { count } = await tx.activityRegistration.updateMany({
          where: { id: m.registrationId, status: from },
          data: { status: m.status, attendanceMarkedById: user.id, attendanceMarkedAt: now },
        });
        if (count === 0) throw conflict('غيّر شخص آخر الحضور للتو. حدّث الصفحة.');
        changed += 1;
      }
    });
    revalidateActivities(activity.id);
    return changed ? `سُجّل حضور ${changed} مشارك باسمك.` : 'لا تغيير: الحالات كما هي.';
  });
}
