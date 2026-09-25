'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission, requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { isCommitteeMember } from '@/lib/committees';
import { db, type Tx } from '@/lib/db';
import { conflict, invalid, notFound } from '@/lib/errors';
import type { TaskStatus } from '@/lib/generated/prisma/enums';
import { dispatchEmails, queueNotifications } from '@/lib/notify';
import { TASK_STATUS_LABELS, taskTransitionPermission } from '@/lib/tasks/workflow';
import {
  CommentTaskSchema,
  CreateTaskSchema,
  MoveTaskSchema,
  ReassignTaskSchema,
  TaskIdSchema,
} from '@/lib/validation/tasks';

// مهام اللجان — AC-05 · AC-06. الترتيب: هوية وصلاحية ← Zod ← السجل ونطاقه ← معاملة مع التدقيق.

type LoadedTask = {
  id: string;
  title: string;
  status: TaskStatus;
  committeeId: string;
  assigneeId: string | null;
  complaintId: string | null;
  committee: { slug: string };
};

async function load(taskId: string): Promise<LoadedTask> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      status: true,
      committeeId: true,
      assigneeId: true,
      complaintId: true,
      committee: { select: { slug: true } },
    },
  });
  if (!task) throw notFound('المهمة');
  return task;
}

function revalidateTask(slug: string, complaintId?: string | null) {
  revalidatePath(`/admin/committees/${slug}/tasks`);
  revalidatePath(`/admin/committees/${slug}`);
  revalidatePath('/admin/tasks');
  if (complaintId) revalidatePath(`/admin/complaints/${complaintId}`);
}

async function assertMember(committeeId: string, userId: string) {
  if (!(await isCommitteeMember(db, committeeId, userId))) {
    throw invalid('المسند إليه ليس عضوًا في هذه اللجنة في الدورة الحالية. اختر عضوًا من القائمة.', {
      assigneeId: ['ليس عضوًا في اللجنة.'],
    });
  }
}

function assignedDraft(tx: Tx, task: { id: string; title: string; committeeSlug: string }, assigneeId: string) {
  return queueNotifications(tx, [
    {
      type: 'TASK_ASSIGNED',
      title: `مهمة جديدة لك: ${task.title}`,
      link: `/admin/committees/${task.committeeSlug}/tasks`,
      userIds: [assigneeId],
      email: true,
    },
  ]);
}

/** AC-05 — إنشاء مهمة (من شكوى أو مستقلة) وإسنادها */
export async function createTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'tasks:create');
    const data = CreateTaskSchema.parse(formToObject(form));

    const committee = await db.committee.findFirst({
      where: { id: data.committeeId, isActive: true },
      select: { id: true, slug: true },
    });
    if (!committee) throw notFound('اللجنة');
    requirePermission(user, 'tasks:create', { committeeId: committee.id });

    if (data.complaintId) {
      // المهمة من شكوى: الشكوى يجب أن تكون محوّلة لهذه اللجنة نفسها
      const complaint = await db.complaint.findUnique({ where: { id: data.complaintId }, select: { committeeId: true } });
      if (!complaint) throw notFound('الشكوى');
      if (complaint.committeeId !== committee.id) throw invalid('هذه الشكوى ليست محوّلة إلى هذه اللجنة.');
    }
    if (data.dueAt && data.dueAt <= new Date()) {
      throw invalid('آخر موعد يجب أن يكون في المستقبل.', { dueAt: ['تاريخ في الماضي.'] });
    }
    await assertMember(committee.id, data.assigneeId);

    const emailIds = await db.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          title: data.title,
          description: data.description ?? null,
          committeeId: committee.id,
          priority: data.priority,
          dueAt: data.dueAt ?? null,
          assigneeId: data.assigneeId,
          createdById: user.id,
          complaintId: data.complaintId ?? null,
        },
      });
      await writeAudit(tx, user, 'task.assign', 'Task', task.id, null, task);
      return assignedDraft(tx, { id: task.id, title: task.title, committeeSlug: committee.slug }, data.assigneeId);
    });
    await dispatchEmails(db, emailIds);
    revalidateTask(committee.slug, data.complaintId);
    return 'أُنشئت المهمة وأُشعر المسند إليه.';
  });
}

/** إعادة الإسناد — tasks:update (AC-05) */
export async function reassignTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'tasks:update');
    const data = ReassignTaskSchema.parse(formToObject(form));
    const task = await load(data.taskId);
    // «خاص» للعضو لا يكفي لإعادة إسناد مهمة غيره: الإسناد قرار اللجنة
    requirePermission(user, 'tasks:update', { committeeId: task.committeeId });
    if (task.status === 'DONE') throw conflict('المهمة منجزة ومعتمدة، ولا يُعاد إسنادها.');
    if (task.assigneeId === data.assigneeId) throw conflict('المهمة مسندة لهذا العضو بالفعل.');
    await assertMember(task.committeeId, data.assigneeId);

    const emailIds = await db.$transaction(async (tx) => {
      const updated = await tx.task.update({ where: { id: task.id }, data: { assigneeId: data.assigneeId } });
      await writeAudit(tx, user, 'task.assign', 'Task', task.id, { assigneeId: task.assigneeId }, { assigneeId: updated.assigneeId });
      return assignedDraft(tx, { id: task.id, title: task.title, committeeSlug: task.committee.slug }, data.assigneeId);
    });
    await dispatchEmails(db, emailIds);
    revalidateTask(task.committee.slug, task.complaintId);
    return 'أُعيد إسناد المهمة.';
  });
}

/** نقل المهمة بين الأعمدة حتى «مراجعة» — tasks:update (خاص للعضو على مهمته، لجنة للرئيس) */
export async function moveTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'tasks:update');
    const data = MoveTaskSchema.parse(formToObject(form));
    const task = await load(data.taskId);

    const needed = taskTransitionPermission(task.status, data.toStatus);
    if (!needed) {
      throw invalid(
        `لا يمكن نقل المهمة من «${TASK_STATUS_LABELS[task.status]}» إلى «${TASK_STATUS_LABELS[data.toStatus]}».`,
      );
    }
    // «منجزة» تمرّ بالاعتماد وحده — AC-06 ②
    if (needed !== 'tasks:update') {
      throw invalid('نقل المهمة إلى «منجزة» اعتماد يملكه رئيس اللجنة. استخدم «اعتماد» إن كان لك.');
    }
    requirePermission(user, 'tasks:update', { committeeId: task.committeeId, ownerId: task.assigneeId });

    const { count } = await db.task.updateMany({
      where: { id: task.id, status: task.status },
      data: { status: data.toStatus },
    });
    if (count === 0) throw conflict('تغيّرت حالة المهمة للتو من شخص آخر. حدّث اللوحة.');
    revalidateTask(task.committee.slug, task.complaintId);
    return `المهمة الآن: ${TASK_STATUS_LABELS[data.toStatus]}.`;
  });
}

/** REVIEW → DONE — tasks:approve (AC-06). لا اعتماد ذاتي: التطبيق يرفض، وقيد tasks_no_self_approval يرفض لو تجاوزه أحد. */
export async function approveTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'tasks:approve');
    const { taskId } = TaskIdSchema.parse(formToObject(form));
    const task = await load(taskId);
    requirePermission(user, 'tasks:approve', { committeeId: task.committeeId });
    if (taskTransitionPermission(task.status, 'DONE') !== 'tasks:approve') {
      throw invalid('تُعتمد المهمة من عمود «مراجعة» فقط، بعد أن ينقلها المسند إليه.');
    }
    if (task.assigneeId === user.id) {
      throw invalid('لا يمكنك اعتماد مهمة مسندة إليك. يعتمدها رئيس اللجنة أو رئيس المجلس.');
    }

    await db.$transaction(async (tx) => {
      const { count } = await tx.task.updateMany({
        where: { id: task.id, status: 'REVIEW' },
        data: { status: 'DONE', approvedById: user.id, approvedAt: new Date() },
      });
      if (count === 0) throw conflict('تغيّرت حالة المهمة للتو. حدّث اللوحة.');
      await writeAudit(tx, user, 'task.approve', 'Task', task.id, { status: task.status }, { status: 'DONE', approvedById: user.id });
      // AC-06 ④: إنجاز مهمة مرتبطة بشكوى يُسجَّل في سجل الشكوى (داخليًا)
      if (task.complaintId) {
        const complaint = await tx.complaint.findUniqueOrThrow({ where: { id: task.complaintId }, select: { status: true } });
        await tx.complaintEvent.create({
          data: {
            complaintId: task.complaintId,
            fromStatus: complaint.status,
            toStatus: complaint.status,
            note: `أُنجزت واعتُمدت المهمة: ${task.title}`,
            isPublic: false,
            actorId: user.id,
          },
        });
      }
    });
    revalidateTask(task.committee.slug, task.complaintId);
    return 'اعتُمدت المهمة منجزة.';
  });
}

/** ملاحظة متابعة — tasks:comment (لجنة، أو خاص لأمين الصندوق على مهمته) */
export async function commentTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'tasks:comment');
    const data = CommentTaskSchema.parse(formToObject(form));
    const task = await load(data.taskId);
    requirePermission(user, 'tasks:comment', { committeeId: task.committeeId, ownerId: task.assigneeId });
    await db.taskComment.create({ data: { taskId: task.id, authorId: user.id, body: data.body } });
    revalidateTask(task.committee.slug);
    return 'أُضيفت الملاحظة.';
  });
}
