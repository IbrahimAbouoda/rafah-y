import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  decideIdeaAction,
  mergeIdeaAction,
  reviewIdeaAction,
  reviseIdeaAction,
  submitIdeaAction,
  voteIdeaAction,
} from '@/server/actions/ideas';
import { actAs, committeeId, createUser, form } from '../support/factories';

// Sprint 2 — الأفكار: AC-07 · AC-08

const base = () => ({
  clientDraftId: randomUUID(),
  title: 'مساحة دراسة مسائية للطلاب',
  problem: 'لا يوجد مكان هادئ ومضاء للدراسة مساءً في المنطقة التجريبية.',
  solution: 'تجهيز قاعة في المركز الشبابي بإنارة ومقاعد وفتحها من السادسة حتى العاشرة.',
  estimatedCost: '1500.50',
});

async function submitted() {
  const youth = await createUser(['youth'], 'شاب');
  await actAs(youth.id);
  const res = await submitIdeaAction(base());
  expect(res).toMatchObject({ ok: true });
  return { youth, idea: await db.idea.findUniqueOrThrow({ where: { id: res!.data!.id } }) };
}

async function inCommitteeReview(slug = 'activities-initiatives') {
  const s = await submitted();
  const secretary = await createUser(['secretary']);
  await actAs(secretary.id);
  expect(await reviewIdeaAction(null, form({ ideaId: s.idea.id, toStatus: 'SCREENING' }))).toMatchObject({ ok: true });
  expect(
    await reviewIdeaAction(null, form({ ideaId: s.idea.id, toStatus: 'COMMITTEE_REVIEW', committeeId: await committeeId(slug) })),
  ).toMatchObject({ ok: true });
  return { ...s, secretary };
}

async function vote(userId: string, ideaId: string) {
  await actAs(userId);
  return voteIdeaAction(null, form({ ideaId }));
}

describe('submitIdea — AC-07', () => {
  it('SUBMITTED برقم RF-IDA-YYYY-NNNNNN وكلفة عشرية بدقة منزلتين', async () => {
    const { youth, idea } = await submitted();
    expect(idea.reference).toMatch(/^RF-IDA-\d{4}-\d{6}$/);
    expect(idea).toMatchObject({ status: 'SUBMITTED', submitterId: youth.id, voteCount: 0 });
    expect(idea.estimatedCost?.toString()).toBe('1500.5');
  });

  it('① وصف مشكلة أقل من 20 محرفًا مرفوض برسالة عربية', async () => {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    const res = await submitIdeaAction({ ...base(), problem: 'قصير' });
    expect(res).toMatchObject({ ok: false, fieldErrors: { problem: [expect.stringMatching(/20 محرفًا/)] } });
  });

  it('نفس clientDraftId مرتين = فكرة واحدة', async () => {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    const payload = base();
    const a = await submitIdeaAction(payload);
    const b = await submitIdeaAction(payload);
    expect(b).toMatchObject({ ok: true, data: { id: a!.data!.id, duplicate: true } });
    expect(await db.idea.count({ where: { clientDraftId: payload.clientDraftId } })).toBe(1);
  });

  it('من لا يملك ideas:create مرفوض قبل المدخلات', async () => {
    const head = await createUser([{ key: 'committee_head', committee: 'health-affairs' }]);
    await actAs(head.id);
    expect(await submitIdeaAction({ junk: 1 })).toMatchObject({ ok: false, message: expect.stringMatching(/لا تملك صلاحية/) });
  });
});

describe('التصويت — AC-07 · AC-08 ②', () => {
  it('② مرتان لا تزيدان العداد · ③ صاحب الفكرة يصوّت مرة · ④ العداد = عدد الصفوف', async () => {
    const { youth, idea } = await inCommitteeReview();
    const a = await createUser(['youth']);
    const b = await createUser(['youth']);
    expect(await vote(a.id, idea.id)).toMatchObject({ ok: true, message: expect.stringMatching(/سُجّل صوتك/) });
    expect(await vote(a.id, idea.id)).toMatchObject({ ok: true, message: expect.stringMatching(/من قبل/) });
    expect(await vote(youth.id, idea.id)).toMatchObject({ ok: true });
    await Promise.all([vote(b.id, idea.id), vote(b.id, idea.id)]);

    const fresh = await db.idea.findUniqueOrThrow({ where: { id: idea.id } });
    expect(fresh.voteCount).toBe(3);
    expect(await db.ideaVote.count({ where: { ideaId: idea.id } })).toBe(3);
  });

  it('لا تصويت قبل الفرز ولا على المدموجة', async () => {
    const { idea } = await submitted();
    const voter = await createUser(['youth']);
    expect(await vote(voter.id, idea.id)).toMatchObject({ ok: false, message: expect.stringMatching(/مغلق/) });

    const target = await inCommitteeReview();
    const secretary = await createUser(['secretary']);
    await actAs(secretary.id);
    expect(await mergeIdeaAction(null, form({ ideaId: idea.id, intoReference: target.idea.reference }))).toMatchObject({ ok: true });
    expect(await db.idea.findUniqueOrThrow({ where: { id: idea.id } })).toMatchObject({ status: 'MERGED', mergedIntoId: target.idea.id });
    expect(await vote(voter.id, idea.id)).toMatchObject({ ok: false, message: expect.stringMatching(/دُمجت/) });
    expect(await db.auditLog.count({ where: { action: 'idea.merge', entityId: idea.id } })).toBe(1);
  });

  it('من لا يملك ideas:vote (عضو المجلس بلا دور شاب) مرفوض', async () => {
    const { idea } = await inCommitteeReview();
    const secretary = await createUser(['secretary']);
    expect(await vote(secretary.id, idea.id)).toMatchObject({ ok: false, message: expect.stringMatching(/لا تملك صلاحية/) });
  });
});

describe('المراجعة والاعتماد — AC-08', () => {
  it('فرز ← لجنة ← طلب تعديل ← تعديل صاحبها ← اعتماد الرئيس، بسطر تدقيق لكل قرار وإشعار لصاحبها', async () => {
    const { youth, idea } = await inCommitteeReview('activities-initiatives');
    const head = await createUser([{ key: 'committee_head', committee: 'activities-initiatives' }]);
    await actAs(head.id);
    expect(
      await reviewIdeaAction(null, form({ ideaId: idea.id, toStatus: 'CHANGES_REQUESTED', note: 'حدّدوا عدد المستفيدين والمكان.' })),
    ).toMatchObject({ ok: true });

    await actAs(youth.id);
    expect(
      await reviseIdeaAction(null, form({ ideaId: idea.id, ...base(), solution: 'قاعة في المركز الشبابي لخمسين طالبًا، من السادسة حتى العاشرة.' })),
    ).toMatchObject({ ok: true });
    expect((await db.idea.findUniqueOrThrow({ where: { id: idea.id } })).status).toBe('COMMITTEE_REVIEW');

    const president = await createUser(['council_president']);
    await actAs(president.id);
    expect(await decideIdeaAction(null, form({ ideaId: idea.id, decision: 'APPROVED', note: 'تُنفّذ ضمن مبادرة الصيف.' }))).toMatchObject({
      ok: true,
    });
    expect(await db.idea.findUniqueOrThrow({ where: { id: idea.id } })).toMatchObject({ status: 'APPROVED', decidedById: president.id });

    const actions = (await db.auditLog.findMany({ where: { entityId: idea.id }, orderBy: { id: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual(['idea.review', 'idea.review', 'idea.review', 'idea.approve']);
    expect(await db.notification.count({ where: { userId: youth.id, type: 'IDEA_DECIDED', channel: 'IN_APP' } })).toBe(3);
  });

  it('① رئيس اللجنة لا يعتمد نهائيًا · التصويت لا يمنح اعتمادًا · الرفض بلا سبب مرفوض', async () => {
    const { idea } = await inCommitteeReview('activities-initiatives');
    const head = await createUser([{ key: 'committee_head', committee: 'activities-initiatives' }]);
    await actAs(head.id);
    expect(await decideIdeaAction(null, form({ ideaId: idea.id, decision: 'APPROVED' }))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/لا تملك صلاحية/),
    });
    for (let i = 0; i < 5; i++) await vote((await createUser(['youth'])).id, idea.id);
    expect((await db.idea.findUniqueOrThrow({ where: { id: idea.id } })).status).toBe('COMMITTEE_REVIEW');

    const president = await createUser(['council_president']);
    await actAs(president.id);
    expect(await decideIdeaAction(null, form({ ideaId: idea.id, decision: 'REJECTED' }))).toMatchObject({
      ok: false,
      fieldErrors: { note: expect.any(Array) },
    });
  });

  it('رئيس لجنة أخرى لا يراجع أفكار لجنة غيره · الإحالة للجنة تتطلب لجنة', async () => {
    const { idea } = await inCommitteeReview('activities-initiatives');
    const other = await createUser([{ key: 'committee_head', committee: 'health-affairs' }]);
    await actAs(other.id);
    expect(
      await reviewIdeaAction(null, form({ ideaId: idea.id, toStatus: 'CHANGES_REQUESTED', note: 'ملاحظة من لجنة أخرى' })),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/لا تملك صلاحية/) });

    const s2 = await submitted();
    const secretary = await createUser(['secretary']);
    await actAs(secretary.id);
    await reviewIdeaAction(null, form({ ideaId: s2.idea.id, toStatus: 'SCREENING' }));
    expect(await reviewIdeaAction(null, form({ ideaId: s2.idea.id, toStatus: 'COMMITTEE_REVIEW' }))).toMatchObject({
      ok: false,
      fieldErrors: { committeeId: expect.any(Array) },
    });
  });

  it('صاحب فكرة آخر لا يعدّل فكرة غيره', async () => {
    const { idea } = await inCommitteeReview();
    const head = await createUser([{ key: 'committee_head', committee: 'activities-initiatives' }]);
    await actAs(head.id);
    await reviewIdeaAction(null, form({ ideaId: idea.id, toStatus: 'CHANGES_REQUESTED', note: 'نحتاج تفاصيل أكثر عن الكلفة.' }));
    const stranger = await createUser(['youth']);
    await actAs(stranger.id);
    expect(await reviseIdeaAction(null, form({ ideaId: idea.id, ...base() }))).toMatchObject({ ok: false });
  });
});
