'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission, requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { writeAudit, type AuditAction } from '@/lib/audit';
import { STATUS_LABELS, transitionPermission } from '@/lib/complaints/workflow';
import { db, type Tx } from '@/lib/db';
import { conflict, invalid, notFound } from '@/lib/errors';
import type { ComplaintStatus, NotificationType } from '@/lib/generated/prisma/enums';
import { committeeHoldersOf, dispatchEmails, queueNotifications, type NotificationDraft } from '@/lib/notify';
import type { PermissionKey, SessionUser } from '@/lib/rbac';
import {
  AssignComplaintSchema,
  CloseComplaintSchema,
  ComplaintIdSchema,
  DismissComplaintSchema,
  ReferComplaintSchema,
  UpdateStatusSchema,
} from '@/lib/validation/complaints';

// مسار الشكوى — PRD §5.1 · AC-03 · AC-04. كل إجراء: هوية وصلاحية ← Zod ← السجل ونطاقه ← معاملة مع التدقيق.

type Loaded = {
  id: string;
  reference: string;
  status: ComplaintStatus;
  committeeId: string | null;
  submitterId: string | null;
};

async function load(complaintId: string): Promise<Loaded> {
  const complaint = await db.complaint.findUnique({
    where: { id: complaintId },
    select: { id: true, reference: true, status: true, committeeId: true, submitterId: true },
  });
  if (!complaint) throw notFound('الشكوى');
  return complaint;
}

/** الانتقال مسموح في المسار، وبهذه الصلاحية تحديدًا — وإلا رفض برسالة تشرح الحالة. */
function assertTransition(from: ComplaintStatus, to: ComplaintStatus, key: PermissionKey) {
  if (transitionPermission(from, to) !== key) {
    throw invalid(
      `لا يمكن نقل الشكوى من «${STATUS_LABELS[from]}» إلى «${STATUS_LABELS[to]}» في مسارها. حدّث الصفحة لترى الإجراءات المتاحة.`,
    );
  }
}

type TransitionSpec = {
  user: SessionUser;
  complaint: Loaded;
  to: ComplaintStatus;
  audit: AuditAction;
  data?: Record<string, unknown>;
  event: { note: string | null; isPublic: boolean };
  notify?: NotificationDraft[];
  /** تغييرات إضافية في نفس المعاملة (إحالة، رد جهة خارجية…) — تعيد ما يُضاف إلى سطر التدقيق */
  extra?: (tx: Tx) => Promise<Record<string, unknown> | void>;
};

async function transition(spec: TransitionSpec): Promise<void> {
  const { user, complaint, to } = spec;
  const emailIds = await db.$transaction(async (tx) => {
    // الشرط على الحالة السابقة يمنع تجاوز تغيير متزامن من شخص آخر
    const { count } = await tx.complaint.updateMany({
      where: { id: complaint.id, status: complaint.status },
      data: { status: to, ...spec.data },
    });
    if (count === 0) throw conflict('تغيّرت حالة هذه الشكوى للتو من شخص آخر. حدّث الصفحة وراجعها قبل المتابعة.');

    await tx.complaintEvent.create({
      data: {
        complaintId: complaint.id,
        fromStatus: complaint.status,
        toStatus: to,
        note: spec.event.note,
        isPublic: spec.event.isPublic,
        actorId: user.id,
      },
    });
    const extra = (await spec.extra?.(tx)) ?? {};
    await writeAudit(
      tx,
      user,
      spec.audit,
      'Complaint',
      complaint.id,
      { status: complaint.status, committeeId: complaint.committeeId },
      { status: to, ...spec.data, note: spec.event.note, isPublic: spec.event.isPublic, ...extra },
    );
    return queueNotifications(tx, spec.notify ?? [submitterDraft(complaint, to, spec.event)]);
  });
  await dispatchEmails(db, emailIds);
  revalidatePath(`/admin/complaints/${complaint.id}`);
  revalidatePath('/admin/complaints');
  revalidatePath('/admin/inbox');
}

/** §8.2: مقدّم الشكوى المسجّل يُشعَر بكل تغيّر حالة (المجهولة بلا مستلم — §8.3). */
function submitterDraft(
  complaint: Loaded,
  to: ComplaintStatus,
  event: { note: string | null; isPublic: boolean },
): NotificationDraft {
  const done = to === 'RESOLVED' || to === 'CLOSED' || to === 'DISMISSED';
  const type: NotificationType = done ? 'COMPLAINT_RESOLVED' : 'COMPLAINT_STATUS_CHANGED';
  return {
    type,
    title: `شكواك ${complaint.reference}: ${STATUS_LABELS[to]}`,
    // الملاحظة الداخلية لا تصل مقدّم الشكوى في أي قناة
    body: event.isPublic && event.note ? event.note : undefined,
    link: `/me/complaints/${complaint.reference}`,
    userIds: [complaint.submitterId],
    email: true,
  };
}

// ─── الفرز (أمانة السر) ────────────────────────────────────────────

/** SUBMITTED → UNDER_REVIEW — §5.1 خطوة 5 */
export async function openForTriageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'complaints:triage');
    const data = ComplaintIdSchema.parse(formToObject(form));
    const complaint = await load(data.complaintId);
    requirePermission(user, 'complaints:triage', { committeeId: complaint.committeeId });
    assertTransition(complaint.status, 'UNDER_REVIEW', 'complaints:triage');

    await transition({
      user,
      complaint,
      to: 'UNDER_REVIEW',
      audit: 'complaint.triage',
      event: { note: 'بدأت أمانة السر فرز الشكوى لتحديد اللجنة المختصة.', isPublic: true },
    });
    return 'فُتحت الشكوى للفرز. اختر اللجنة المختصة وحوّلها.';
  });
}

/** UNDER_REVIEW → ASSIGNED — §5.1 خطوة 6 · AC-03 */
export async function assignToCommitteeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'complaints:triage');
    const data = AssignComplaintSchema.parse(formToObject(form));
    const complaint = await load(data.complaintId);
    requirePermission(user, 'complaints:triage', { committeeId: complaint.committeeId });
    assertTransition(complaint.status, 'ASSIGNED', 'complaints:triage');

    // AC-03: اللجنة يجب أن تكون نشطة
    const committee = await db.committee.findFirst({
      where: { id: data.committeeId, isActive: true },
      select: { id: true, nameAr: true },
    });
    if (!committee) {
      throw invalid('اللجنة غير موجودة أو معطّلة. اختر لجنة نشطة.', { committeeId: ['اختر لجنة نشطة.'] });
    }

    await transition({
      user,
      complaint,
      to: 'ASSIGNED',
      audit: 'complaint.assign',
      data: { committeeId: committee.id },
      event: { note: `حُوّلت الشكوى إلى ${committee.nameAr}.`, isPublic: true },
      extra: async (tx) => {
        // تعليق التحويل داخلي: للجنة فقط، لا يظهر في /track
        if (data.note) {
          await tx.complaintEvent.create({
            data: {
              complaintId: complaint.id,
              fromStatus: 'ASSIGNED',
              toStatus: 'ASSIGNED',
              note: data.note,
              isPublic: false,
              actorId: user.id,
            },
          });
        }
        return { committeeNameAr: committee.nameAr, triageNote: data.note ?? null };
      },
      notify: [
        {
          type: 'COMPLAINT_ASSIGNED',
          title: `شكواك ${complaint.reference} حُوّلت إلى ${committee.nameAr}`,
          link: `/me/complaints/${complaint.reference}`,
          userIds: [complaint.submitterId],
          // §8.2: بريد التحويل لرئيس اللجنة فقط؛ المقدّم يُشعَر داخل المنصة
          email: false,
        },
        {
          type: 'COMPLAINT_ASSIGNED',
          title: `شكوى جديدة للجنة: ${complaint.reference}`,
          body: data.note ? `تعليق التحويل: ${data.note}` : undefined,
          link: `/admin/complaints/${complaint.id}`,
          userIds: await committeeHoldersOf(db, committee.id, 'complaints:update_status'),
          email: true,
        },
      ],
    });
    return `حُوّلت الشكوى إلى ${committee.nameAr}، وأُشعر رئيس اللجنة.`;
  });
}

// ─── اللجنة ─────────────────────────────────────────────────────────

/** انتقالات complaints:update_status — §5.1 خطوات 7 و 9 و 10 · AC-04 */
export async function updateStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'complaints:update_status');
    const data = UpdateStatusSchema.parse(formToObject(form));
    const complaint = await load(data.complaintId);
    // AC-04 ①: رئيس لجنة أخرى يُرفض هنا حتى لو خمّن المعرّف
    requirePermission(user, 'complaints:update_status', { committeeId: complaint.committeeId });
    assertTransition(complaint.status, data.toStatus, 'complaints:update_status');

    const resolving = data.toStatus === 'RESOLVED';
    // ملاحظة الحل تصل مقدّم الشكوى دائمًا (§5.1 خطوة 10)
    const isPublic = resolving || data.isPublic;
    const responseArrived = complaint.status === 'WAITING_RESPONSE' && data.toStatus === 'IN_PROGRESS' && !!data.response;

    await transition({
      user,
      complaint,
      to: data.toStatus,
      audit: 'complaint.status_change',
      data: resolving ? { resolutionNote: data.note } : undefined,
      event: { note: data.note ?? null, isPublic },
      extra: responseArrived
        ? async (tx) => {
            const referral = await tx.complaintReferral.findFirst({
              where: { complaintId: complaint.id, respondedAt: null },
              orderBy: { createdAt: 'desc' },
              select: { id: true },
            });
            if (!referral) return;
            await tx.complaintReferral.update({
              where: { id: referral.id },
              data: { respondedAt: new Date(), response: data.response },
            });
            return { referralId: referral.id, referralResponded: true };
          }
        : undefined,
    });
    return `الحالة الآن: ${STATUS_LABELS[data.toStatus]}.`;
  });
}

/** COMMITTEE_REVIEW → REFERRED — §5.1 خطوة 8 */
export async function referComplaintAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'complaints:refer');
    const data = ReferComplaintSchema.parse(formToObject(form));
    const complaint = await load(data.complaintId);
    requirePermission(user, 'complaints:refer', { committeeId: complaint.committeeId });
    assertTransition(complaint.status, 'REFERRED', 'complaints:refer');
    if (data.followUpAt && data.followUpAt <= new Date()) {
      throw invalid('موعد المتابعة يجب أن يكون في المستقبل.', { followUpAt: ['تاريخ في الماضي.'] });
    }

    await transition({
      user,
      complaint,
      to: 'REFERRED',
      audit: 'complaint.refer',
      // اسم الجهة وتفاصيل الإحالة داخلية؛ المقدّم يرى أنها أُحيلت فقط
      event: { note: 'أُحيلت الشكوى إلى جهة خارجية مختصة، واللجنة تتابع معها.', isPublic: true },
      extra: async (tx) => {
        const referral = await tx.complaintReferral.create({
          data: {
            complaintId: complaint.id,
            target: data.target,
            targetName: data.targetName,
            followUpAt: data.followUpAt ?? null,
            note: data.note ?? null,
            createdById: user.id,
          },
        });
        return { referral };
      },
    });
    return `أُحيلت الشكوى إلى ${data.targetName}.`;
  });
}

/** RESOLVED → CLOSED — §5.1 خطوة 11 */
export async function closeComplaintAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'complaints:close');
    const data = CloseComplaintSchema.parse(formToObject(form));
    const complaint = await load(data.complaintId);
    requirePermission(user, 'complaints:close', { committeeId: complaint.committeeId });
    assertTransition(complaint.status, 'CLOSED', 'complaints:close');

    await transition({
      user,
      complaint,
      to: 'CLOSED',
      audit: 'complaint.close',
      data: { closedAt: new Date() },
      event: { note: data.note ?? 'أُغلقت الشكوى بعد حلّها. شكرًا لمتابعتك.', isPublic: true },
    });
    return 'أُغلقت الشكوى.';
  });
}

/** UNDER_REVIEW → DISMISSED — §5.1 خطوة 12. السبب إلزامي، وقيد قاعدة البيانات يفرضه أيضًا (AC-04 ③). */
export async function dismissComplaintAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'complaints:close');
    const data = DismissComplaintSchema.parse(formToObject(form));
    const complaint = await load(data.complaintId);
    requirePermission(user, 'complaints:close', { committeeId: complaint.committeeId });
    assertTransition(complaint.status, 'DISMISSED', 'complaints:close');

    await transition({
      user,
      complaint,
      to: 'DISMISSED',
      audit: 'complaint.close',
      data: { dismissReason: data.reason, closedAt: new Date() },
      // السبب يصل مقدّم الشكوى: من حقه أن يعرف لماذا استُبعدت
      event: { note: data.reason, isPublic: true },
    });
    return 'استُبعدت الشكوى، وسُجّل السبب.';
  });
}
