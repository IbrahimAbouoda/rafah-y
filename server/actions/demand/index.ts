'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission, requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { conceptNoteDraft } from '@/lib/concept-notes';
import { PARTNERSHIPS_COMMITTEE_SLUG } from '@/lib/config';
import { db, type Tx } from '@/lib/db';
import { conflict, invalid, notFound } from '@/lib/errors';
import { Prisma } from '@/lib/generated/prisma/client';
import {
  ConceptNoteIdSchema,
  CreatePollSchema,
  DemandVoteSchema,
  EditConceptNoteSchema,
  SetThresholdSchema,
} from '@/lib/validation/initiatives';

// محرك الطلب — AC-12: «فرصة عمل... كيف أكون؟». صوت واحد لكل حساب لكل استطلاع، قابل للتغيير.
// بلوغ الحد ينشئ Concept Note مسودة واحدة (demandOptionId فريد) تظهر في مهام لجنة المؤسسات والشراكات.
// لا إرسال لأي جهة قبل approvedAt من الرئيس (C15).

function revalidateDemand() {
  revalidatePath('/demand');
  revalidatePath('/admin/initiatives');
}

/** demand:manage — استطلاع بخياراته */
export async function createPollAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'demand:manage');
    const data = CreatePollSchema.parse(formToObject(form));
    requirePermission(user, 'demand:manage', {});
    if (data.closesAt && data.closesAt <= new Date()) throw invalid('تاريخ الإغلاق في الماضي.', { closesAt: ['تاريخ في الماضي.'] });
    if (new Set(data.options).size !== data.options.length) throw invalid('في الخيارات تكرار. اجعل كل خيار مختلفًا.', { options: ['خيار مكرر.'] });
    await db.demandPoll.create({
      data: {
        title: data.title,
        description: data.description ?? null,
        proposalThreshold: data.proposalThreshold,
        closesAt: data.closesAt ?? null,
        initiativeId: data.initiativeId ?? null,
        createdById: user.id,
        options: { create: data.options.map((label, i) => ({ label, sortOrder: i })) },
      },
    });
    revalidateDemand();
    return 'نُشر الاستطلاع في صفحة «الطلب».';
  });
}

/** demand:manage — حد المقترح وفتح الاستطلاع أو إغلاقه */
export async function setThresholdAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'demand:manage');
    const data = SetThresholdSchema.parse(formToObject(form));
    const poll = await db.demandPoll.findUnique({ where: { id: data.pollId }, select: { id: true } });
    if (!poll) throw notFound('الاستطلاع');
    requirePermission(user, 'demand:manage', {});
    await db.$transaction(async (tx) => {
      await tx.demandPoll.update({ where: { id: poll.id }, data: { proposalThreshold: data.proposalThreshold, isActive: data.isActive } });
      // خفض الحد قد يجعل خيارًا بالغًا له الآن
      await draftForReachedOptions(tx, poll.id);
    });
    revalidateDemand();
    return 'حُفظ الحد.';
  });
}

/** demand:vote («خاص») — صوت واحد لكل حساب لكل استطلاع، ويمكن تغييره (AC-12 ①) */
export async function demandVoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'demand:vote');
    const data = DemandVoteSchema.parse(formToObject(form));
    const poll = await db.demandPoll.findUnique({
      where: { id: data.pollId },
      select: { id: true, isActive: true, closesAt: true, options: { where: { id: data.optionId }, select: { id: true } } },
    });
    if (!poll || poll.options.length === 0) throw notFound('المجال');
    requirePermission(user, 'demand:vote', { ownerId: user.id });
    if (!poll.isActive || (poll.closesAt && poll.closesAt <= new Date())) throw invalid('أُغلق هذا الاستطلاع.');

    const created = await db.$transaction(async (tx) => {
      await tx.demandVote.upsert({
        where: { pollId_userId: { pollId: poll.id, userId: user.id } },
        create: { pollId: poll.id, userId: user.id, optionId: data.optionId },
        update: { optionId: data.optionId },
      });
      // العدّادات من الصفوف دائمًا — تغيير الصوت ينقص خيارًا ويزيد آخر
      const counts = await tx.demandVote.groupBy({ by: ['optionId'], where: { pollId: poll.id }, _count: { _all: true } });
      const byOption = new Map(counts.map((c) => [c.optionId, c._count._all]));
      const options = await tx.demandOption.findMany({ where: { pollId: poll.id }, select: { id: true } });
      for (const o of options) await tx.demandOption.update({ where: { id: o.id }, data: { voteCount: byOption.get(o.id) ?? 0 } });
      return draftForReachedOptions(tx, poll.id);
    });
    revalidateDemand();
    return created > 0 ? 'سُجّل صوتك — وبلغ هذا المجال حد المقترح، فأُنشئت مسودة مقترح للمجلس.' : 'سُجّل صوتك. يمكنك تغييره ما دام الاستطلاع مفتوحًا.';
  });
}

/**
 * لكل خيار بلغ الحد ولا مسودة له: Concept Note مسودة + مهمة في لجنة المؤسسات والشراكات.
 * AC-12 ②: مسودة واحدة لا أكثر — demandOptionId فريد في قاعدة البيانات، والتعارض المتزامن يُتجاهل.
 */
async function draftForReachedOptions(tx: Tx, pollId: string): Promise<number> {
  const poll = await tx.demandPoll.findUniqueOrThrow({
    where: { id: pollId },
    select: {
      title: true,
      description: true,
      proposalThreshold: true,
      createdById: true,
      initiative: { select: { title: true } },
      options: { select: { id: true, label: true, voteCount: true, conceptNote: { select: { id: true } } } },
    },
  });
  const totalVoters = await tx.demandVote.count({ where: { pollId } });
  const committee = await tx.committee.findUnique({ where: { slug: PARTNERSHIPS_COMMITTEE_SLUG }, select: { id: true } });
  let created = 0;
  for (const o of poll.options) {
    if (o.conceptNote || o.voteCount < poll.proposalThreshold) continue;
    const draft = conceptNoteDraft({
      pollTitle: poll.title,
      pollDescription: poll.description,
      optionLabel: o.label,
      voterCount: o.voteCount,
      totalVoters,
      threshold: poll.proposalThreshold,
      initiativeTitle: poll.initiative?.title,
    });
    try {
      // نقطة حفظ: التعارض على demandOptionId (مسودة أنشأها طلب متزامن) لا يُفشل تصويت المستخدم
      await tx.$executeRaw`SAVEPOINT concept_note_draft`;
      await tx.conceptNote.create({
        data: { title: draft.title, bodyMd: draft.bodyMd, demandOptionId: o.id, voterCount: o.voteCount, generatedBy: 'SYSTEM' },
      });
      if (committee) {
        await tx.task.create({
          data: {
            title: `مراجعة مسودة Concept Note: ${o.label}`,
            description: `بلغ مجال «${o.label}» حد المقترح (${o.voteCount} صوتًا). راجعوا المسودة وأكملوها قبل عرضها على الرئيس.`,
            committeeId: committee.id,
            createdById: poll.createdById,
            priority: 'HIGH',
          },
        });
      }
      await tx.$executeRaw`RELEASE SAVEPOINT concept_note_draft`;
      created += 1;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT concept_note_draft`;
        continue;
      }
      throw e;
    }
  }
  return created;
}

// ─── Concept Note (concept_notes:approve — الرئيس) ────────────────────

async function loadNote(id: string) {
  const note = await db.conceptNote.findUnique({ where: { id }, select: { id: true, status: true, approvedAt: true, title: true } });
  if (!note) throw notFound('المسودة');
  return note;
}

/** تحرير نص المسودة قبل الاعتماد */
export async function editConceptNoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'concept_notes:approve');
    const data = EditConceptNoteSchema.parse(formToObject(form));
    const note = await loadNote(data.conceptNoteId);
    requirePermission(user, 'concept_notes:approve', {});
    if (note.status !== 'DRAFT' && note.status !== 'IN_REVIEW') throw conflict('المسودة معتمدة أو مرسلة ولا تُعدَّل.');
    await db.conceptNote.update({ where: { id: note.id }, data: { title: data.title, bodyMd: data.bodyMd, reviewedById: user.id } });
    revalidateDemand();
    return 'حُفظت المسودة.';
  });
}

/** الاعتماد البشري المسجَّل (C15) — conceptnote.approve */
export async function approveConceptNoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'concept_notes:approve');
    const { conceptNoteId } = ConceptNoteIdSchema.parse(formToObject(form));
    const note = await loadNote(conceptNoteId);
    requirePermission(user, 'concept_notes:approve', {});
    if (note.status !== 'DRAFT' && note.status !== 'IN_REVIEW') throw conflict('المسودة معتمدة أو مرسلة من قبل.');
    await db.$transaction(async (tx) => {
      await tx.conceptNote.update({
        where: { id: note.id },
        data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date() },
      });
      await writeAudit(tx, user, 'conceptnote.approve', 'ConceptNote', note.id, { status: note.status }, {
        status: 'APPROVED',
        approvedById: user.id,
      });
    });
    revalidateDemand();
    return 'اعتُمد المقترح. يمكن الآن إرساله للجهة المانحة وتعليمه «أُرسل».';
  });
}

/** تعليم الإرسال — يُرفض دون approvedAt (AC-12 ④ · C15) — conceptnote.send */
export async function markConceptNoteSentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'concept_notes:approve');
    const { conceptNoteId } = ConceptNoteIdSchema.parse(formToObject(form));
    const note = await loadNote(conceptNoteId);
    requirePermission(user, 'concept_notes:approve', {});
    if (!note.approvedAt || note.status !== 'APPROVED') {
      throw invalid('لا يُرسل مقترح قبل اعتماده من رئيس المجلس. اعتمده أولًا.');
    }
    await db.$transaction(async (tx) => {
      const { count } = await tx.conceptNote.updateMany({
        where: { id: note.id, status: 'APPROVED', approvedAt: { not: null } },
        data: { status: 'SENT', sentAt: new Date() },
      });
      if (count === 0) throw conflict('تغيّرت حالة المسودة للتو.');
      await writeAudit(tx, user, 'conceptnote.send', 'ConceptNote', note.id, { status: note.status }, { status: 'SENT' });
    });
    revalidateDemand();
    return 'سُجّل إرسال المقترح.';
  });
}
