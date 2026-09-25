'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission, requireUser } from '@/lib/auth';
import { formToObject, runAction, runActionData, type ActionState, type DataState } from '@/lib/action';
import { writeAudit, type AuditAction } from '@/lib/audit';
import { db, type Tx } from '@/lib/db';
import { conflict, invalid, notFound } from '@/lib/errors';
import { Prisma } from '@/lib/generated/prisma/client';
import type { IdeaStatus } from '@/lib/generated/prisma/enums';
import { IDEA_STATUS_LABELS, ideaTransitionPermission, VOTABLE_IDEA_STATUSES } from '@/lib/ideas/workflow';
import { dispatchEmails, queueNotifications } from '@/lib/notify';
import type { PermissionKey, SessionUser } from '@/lib/rbac';
import { nextRef } from '@/lib/sequence';
import {
  DecideIdeaSchema,
  IdeaIdSchema,
  MergeIdeaSchema,
  ReviewIdeaSchema,
  ReviseIdeaSchema,
  SubmitIdeaSchema,
} from '@/lib/validation/ideas';

// الأفكار — PRD §5.2 · AC-07 · AC-08.

type LoadedIdea = {
  id: string;
  reference: string;
  title: string;
  status: IdeaStatus;
  committeeId: string | null;
  submitterId: string;
};

async function load(ideaId: string): Promise<LoadedIdea> {
  const idea = await db.idea.findUnique({
    where: { id: ideaId },
    select: { id: true, reference: true, title: true, status: true, committeeId: true, submitterId: true },
  });
  if (!idea) throw notFound('الفكرة');
  return idea;
}

function assertIdeaTransition(from: IdeaStatus, to: IdeaStatus, key: PermissionKey) {
  if (ideaTransitionPermission(from, to) !== key) {
    throw invalid(`لا يمكن نقل الفكرة من «${IDEA_STATUS_LABELS[from]}» إلى «${IDEA_STATUS_LABELS[to]}». حدّث الصفحة.`);
  }
}

function revalidateIdea(id: string) {
  revalidatePath('/ideas');
  revalidatePath(`/ideas/${id}`);
  revalidatePath('/admin/ideas');
  revalidatePath(`/admin/ideas/${id}`);
  revalidatePath('/me/ideas');
}

/** انتقال في معاملة واحدة: شرط الحالة السابقة + التدقيق + إشعار صاحب الفكرة */
async function transition(opts: {
  user: SessionUser;
  idea: LoadedIdea;
  to: IdeaStatus;
  audit: AuditAction;
  data?: Prisma.IdeaUncheckedUpdateManyInput;
  notify?: { title: string; body?: string };
}) {
  const { user, idea, to } = opts;
  const emailIds = await db.$transaction(async (tx) => {
    const { count } = await tx.idea.updateMany({ where: { id: idea.id, status: idea.status }, data: { status: to, ...opts.data } });
    if (count === 0) throw conflict('تغيّرت حالة هذه الفكرة للتو من شخص آخر. حدّث الصفحة.');
    await writeAudit(
      tx,
      user,
      opts.audit,
      'Idea',
      idea.id,
      { status: idea.status, committeeId: idea.committeeId },
      { status: to, ...opts.data },
    );
    return opts.notify
      ? queueNotifications(tx, [
          {
            type: 'IDEA_DECIDED',
            title: opts.notify.title,
            body: opts.notify.body,
            link: `/me/ideas`,
            userIds: [idea.submitterId === user.id ? null : idea.submitterId],
            email: true,
          },
        ])
      : [];
  });
  await dispatchEmails(db, emailIds);
  revalidateIdea(idea.id);
}

// ─── صاحب الفكرة ─────────────────────────────────────────────────────

export type SubmittedIdea = { id: string; reference: string; duplicate: boolean };

/** AC-07 — idempotent بـ clientDraftId: الإعادة تعيد الفكرة نفسها (§7.3) */
export async function submitIdeaAction(input: unknown): Promise<DataState<SubmittedIdea>> {
  return runActionData<SubmittedIdea>(async () => {
    const user = await requireUser();
    requirePermission(user, 'ideas:create');
    const data = SubmitIdeaSchema.parse(input);
    requirePermission(user, 'ideas:create', { ownerId: user.id });

    const existing = await db.idea.findUnique({
      where: { clientDraftId: data.clientDraftId },
      select: { id: true, reference: true, submitterId: true },
    });
    if (existing) {
      if (existing.submitterId !== user.id) throw conflict('هذه المسودة أُرسلت من حساب آخر. ابدأ فكرة جديدة.');
      return { message: 'وصلت فكرتك من قبل.', data: { id: existing.id, reference: existing.reference, duplicate: true } };
    }
    if (data.areaId && !(await db.area.findUnique({ where: { id: data.areaId }, select: { id: true } }))) {
      throw invalid('المنطقة غير موجودة. اختر من القائمة.', { areaId: ['اختر منطقة من القائمة.'] });
    }

    try {
      const idea = await db.$transaction(async (tx) => {
        const reference = await nextRef(tx, 'IDA');
        return tx.idea.create({
          data: {
            reference,
            clientDraftId: data.clientDraftId,
            title: data.title,
            problem: data.problem,
            solution: data.solution,
            estimatedCost: data.estimatedCost ?? null,
            areaId: data.areaId ?? null,
            submitterId: user.id,
          },
          select: { id: true, reference: true },
        });
      });
      revalidatePath('/me/ideas');
      return {
        message: 'وصلت فكرتك. تظهر للعامة ويُصوَّت عليها بعد الفرز الأولي.',
        data: { ...idea, duplicate: false },
      };
    } catch (e) {
      // إرسالان متزامنان بنفس المسودة
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const raced = await db.idea.findUnique({ where: { clientDraftId: data.clientDraftId }, select: { id: true, reference: true } });
        if (raced) return { message: 'وصلت فكرتك من قبل.', data: { ...raced, duplicate: true } };
      }
      throw e;
    }
  });
}

/** CHANGES_REQUESTED → COMMITTEE_REVIEW: صاحب الفكرة يعدّلها (§5.2 D ← C) */
export async function reviseIdeaAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'ideas:create');
    const data = ReviseIdeaSchema.parse(formToObject(form));
    const idea = await load(data.ideaId);
    requirePermission(user, 'ideas:create', { ownerId: idea.submitterId });
    assertIdeaTransition(idea.status, 'COMMITTEE_REVIEW', 'ideas:create');

    await db.$transaction(async (tx) => {
      const { count } = await tx.idea.updateMany({
        where: { id: idea.id, status: 'CHANGES_REQUESTED' },
        data: {
          status: 'COMMITTEE_REVIEW',
          title: data.title,
          problem: data.problem,
          solution: data.solution,
          estimatedCost: data.estimatedCost ?? null,
        },
      });
      if (count === 0) throw conflict('تغيّرت حالة الفكرة للتو. حدّث الصفحة.');
    });
    revalidateIdea(idea.id);
    return 'أُرسل التعديل، وعادت الفكرة إلى مراجعة اللجنة.';
  });
}

/**
 * AC-07 — صوت واحد لكل حساب. المفتاح المركّب [ideaId, userId] يمنع التكرار في قاعدة البيانات،
 * و voteCount يُعاد حسابه من الصفوف داخل المعاملة فيطابقها دائمًا (AC-07 ④).
 */
export async function voteIdeaAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'ideas:vote');
    const { ideaId } = IdeaIdSchema.parse(formToObject(form));
    const idea = await load(ideaId);
    requirePermission(user, 'ideas:vote', { ownerId: user.id });
    if (!VOTABLE_IDEA_STATUSES.includes(idea.status)) {
      throw invalid(
        idea.status === 'MERGED'
          ? 'دُمجت هذه الفكرة بفكرة أخرى: صوّت للفكرة الأصلية.'
          : `التصويت مغلق على هذه الفكرة (${IDEA_STATUS_LABELS[idea.status]}).`,
      );
    }

    const added = await db.$transaction(async (tx) => {
      const { count } = await tx.ideaVote.createMany({ data: [{ ideaId, userId: user.id }], skipDuplicates: true });
      await recountVotes(tx, ideaId);
      return count > 0;
    });
    revalidateIdea(ideaId);
    return added ? 'سُجّل صوتك. شكرًا.' : 'صوّتّ لهذه الفكرة من قبل — صوت واحد لكل حساب.';
  });
}

async function recountVotes(tx: Tx, ideaId: string) {
  const votes = await tx.ideaVote.count({ where: { ideaId } });
  await tx.idea.update({ where: { id: ideaId }, data: { voteCount: votes } });
}

// ─── المراجعة (أمانة السر · اللجنة) ─────────────────────────────────

/** فرز أولي · إحالة للجنة · طلب تعديل — ideas:review (idea.review) */
export async function reviewIdeaAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'ideas:review');
    const data = ReviewIdeaSchema.parse(formToObject(form));
    const idea = await load(data.ideaId);
    requirePermission(user, 'ideas:review', { committeeId: idea.committeeId });
    assertIdeaTransition(idea.status, data.toStatus, 'ideas:review');

    let committeeNameAr: string | null = null;
    if (data.toStatus === 'COMMITTEE_REVIEW') {
      const committee = await db.committee.findFirst({ where: { id: data.committeeId, isActive: true }, select: { nameAr: true } });
      if (!committee) throw invalid('اللجنة غير موجودة أو معطّلة.', { committeeId: ['اختر لجنة نشطة.'] });
      committeeNameAr = committee.nameAr;
    }

    await transition({
      user,
      idea,
      to: data.toStatus,
      audit: 'idea.review',
      data: {
        ...(data.toStatus === 'COMMITTEE_REVIEW' ? { committeeId: data.committeeId } : {}),
        ...(data.note ? { reviewNote: data.note } : {}),
      },
      notify:
        data.toStatus === 'CHANGES_REQUESTED'
          ? { title: `فكرتك ${idea.reference}: مطلوب تعديل`, body: data.note }
          : data.toStatus === 'COMMITTEE_REVIEW'
            ? { title: `فكرتك ${idea.reference} في مراجعة ${committeeNameAr}` }
            : undefined,
    });
    return `الفكرة الآن: ${IDEA_STATUS_LABELS[data.toStatus]}.`;
  });
}

/** دمج فكرة بأخرى — ideas:merge (idea.merge). المدموجة لا يُصوَّت عليها بعد ذلك. */
export async function mergeIdeaAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'ideas:merge');
    const data = MergeIdeaSchema.parse(formToObject(form));
    const idea = await load(data.ideaId);
    requirePermission(user, 'ideas:merge', { committeeId: idea.committeeId });
    assertIdeaTransition(idea.status, 'MERGED', 'ideas:merge');

    const target = await db.idea.findUnique({
      where: { reference: data.intoReference },
      select: { id: true, reference: true, status: true },
    });
    if (!target) throw invalid('لا فكرة بهذا الرقم.', { intoReference: ['رقم غير موجود.'] });
    if (target.id === idea.id) throw invalid('لا تُدمج الفكرة بنفسها.', { intoReference: ['اختر فكرة أخرى.'] });
    if (target.status === 'MERGED' || target.status === 'REJECTED') {
      throw invalid('الفكرة الأصلية مدموجة أو مرفوضة. ادمج في فكرة مفتوحة أو معتمدة.', { intoReference: ['فكرة غير صالحة للدمج.'] });
    }

    await transition({
      user,
      idea,
      to: 'MERGED',
      audit: 'idea.merge',
      data: { mergedIntoId: target.id, ...(data.note ? { reviewNote: data.note } : {}) },
      notify: { title: `فكرتك ${idea.reference} دُمجت في ${target.reference}`, body: 'فكرة مشابهة تُراجع الآن معًا. تابعها برقمها الجديد.' },
    });
    return `دُمجت الفكرة في ${target.reference}.`;
  });
}

/** الاعتماد النهائي أو الرفض — ideas:approve لرئيس المجلس (idea.approve). الرفض = أرشفة بسبب (D24). */
export async function decideIdeaAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'ideas:approve');
    const data = DecideIdeaSchema.parse(formToObject(form));
    const idea = await load(data.ideaId);
    requirePermission(user, 'ideas:approve', { committeeId: idea.committeeId });
    assertIdeaTransition(idea.status, data.decision, 'ideas:approve');

    const approved = data.decision === 'APPROVED';
    await transition({
      user,
      idea,
      to: data.decision,
      audit: 'idea.approve',
      data: { decidedById: user.id, decidedAt: new Date(), ...(data.note ? { reviewNote: data.note } : {}) },
      notify: {
        title: approved ? `اعتُمدت فكرتك ${idea.reference}` : `لم تُعتمد فكرتك ${idea.reference}`,
        body: data.note,
      },
    });
    return approved ? 'اعتُمدت الفكرة.' : 'رُفضت الفكرة وأُرشفت بسببها، وأُشعر صاحبها.';
  });
}
