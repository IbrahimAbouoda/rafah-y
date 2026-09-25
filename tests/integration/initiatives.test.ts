import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { PUBLIC_INITIATIVE_STATUSES, securedTotals } from '@/lib/initiatives/workflow';
import {
  approveConceptNoteAction,
  createPollAction,
  demandVoteAction,
  markConceptNoteSentAction,
} from '@/server/actions/demand';
import { approveFundingAction, recordFundingAction } from '@/server/actions/funding';
import { saveInitiativeAction, setInitiativeStatusAction, upsertNeedAction } from '@/server/actions/initiatives';
import { decideOfferAction, submitOfferAction } from '@/server/actions/offers';
import { linkMemberAction, unlinkMemberAction } from '@/server/actions/organizations';
import { can } from '@/lib/rbac';
import { actAs, committeeId, createUser, form, session } from '../support/factories';

// Sprint 3 — AC-09 · AC-10 · AC-12 · D26 · D27 · D29

async function published(slug = 'activities-initiatives') {
  const head = await createUser([{ key: 'committee_head', committee: slug }], 'رئيس لجنة');
  await actAs(head.id);
  expect(
    await saveInitiativeAction(null, form({ committeeId: await committeeId(slug), title: 'مبادرة صيف الشباب', estimatedBudget: '5000' })),
  ).toMatchObject({ ok: true });
  const initiative = await db.initiative.findFirstOrThrow({ where: { createdById: head.id } });
  expect(
    await upsertNeedAction(null, form({ initiativeId: initiative.id, type: 'FUNDING', description: 'تمويل أدوات الورش', amount: '2000.50' })),
  ).toMatchObject({ ok: true });
  expect(await upsertNeedAction(null, form({ initiativeId: initiative.id, type: 'VENUE', description: 'قاعة لثلاثين شابًا' }))).toMatchObject({
    ok: true,
  });
  expect(await setInitiativeStatusAction(null, form({ initiativeId: initiative.id, toStatus: 'PENDING_APPROVAL' }))).toMatchObject({ ok: true });
  const president = await createUser(['council_president'], 'الرئيس');
  await actAs(president.id);
  expect(await setInitiativeStatusAction(null, form({ initiativeId: initiative.id, toStatus: 'PUBLISHED' }))).toMatchObject({ ok: true });
  const needs = await db.initiativeNeed.findMany({ where: { initiativeId: initiative.id }, orderBy: { createdAt: 'asc' } });
  return { head, president, initiative, funding: needs[0]!, venue: needs[1]! };
}

async function partnerOf(orgName = 'مؤسسة اختبار') {
  const org = await db.organization.create({ data: { name: `${orgName} ${Date.now()}`, type: 'LOCAL_NGO' } });
  const secretary = await createUser(['secretary']);
  const rep = await createUser([], 'ممثل مؤسسة');
  await actAs(secretary.id);
  expect(await linkMemberAction(null, form({ organizationId: org.id, email: rep.email! }))).toMatchObject({ ok: true });
  return { org, rep, secretary };
}

async function offer(repId: string, fields: Record<string, string | string[]>) {
  await actAs(repId);
  const f = form(Object.fromEntries(Object.entries(fields).filter(([, v]) => typeof v === 'string')) as Record<string, string>);
  for (const t of (fields.types as string[]) ?? []) f.append('types', t);
  return submitOfferAction(null, f);
}

describe('المبادرة والاحتياجات — AC-09', () => {
  it('① احتياج بلا نوع مرفوض · ② المبلغ بدقة منزلتين · need.change في التدقيق · النشر بـ initiative.approve', async () => {
    const { head, initiative, funding } = await published();
    expect(funding.amount?.toString()).toBe('2000.5');
    expect(await db.auditLog.count({ where: { action: 'need.change', entityId: funding.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: 'initiative.approve', entityId: initiative.id } })).toBe(1);
    await actAs(head.id);
    expect(await upsertNeedAction(null, form({ initiativeId: initiative.id, description: 'بلا نوع' }))).toMatchObject({
      ok: false,
      fieldErrors: { type: expect.any(Array) },
    });
  });

  it('المبادرة غير المعتمدة لا تظهر للعامة، ورئيس اللجنة لا ينشرها بنفسه', async () => {
    const head = await createUser([{ key: 'committee_head', committee: 'sports-arts' }]);
    await actAs(head.id);
    await saveInitiativeAction(null, form({ committeeId: await committeeId('sports-arts'), title: 'مبادرة لم تُعتمد' }));
    const draft = await db.initiative.findFirstOrThrow({ where: { createdById: head.id } });
    await upsertNeedAction(null, form({ initiativeId: draft.id, type: 'TRAINER', description: 'مدرّب كرة سلة' }));
    await setInitiativeStatusAction(null, form({ initiativeId: draft.id, toStatus: 'PENDING_APPROVAL' }));
    expect(await setInitiativeStatusAction(null, form({ initiativeId: draft.id, toStatus: 'PUBLISHED' }))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/لا تملك صلاحية/),
    });
    const visible = await db.initiative.count({ where: { id: draft.id, status: { in: PUBLIC_INITIATIVE_STATUSES } } });
    expect(visible).toBe(0);
  });

  it('رئيس لجنة أخرى لا يدير احتياجات مبادرة لجنة غيره', async () => {
    const { initiative } = await published('activities-initiatives');
    const other = await createUser([{ key: 'committee_head', committee: 'health-affairs' }]);
    await actAs(other.id);
    expect(await upsertNeedAction(null, form({ initiativeId: initiative.id, type: 'OTHER', description: 'احتياج دخيل' }))).toMatchObject({
      ok: false,
    });
  });
});

describe('ربط المؤسسة — D26 · D27', () => {
  it('الربط يمنح دور partner بسطر role.assign، والفكّ يسحبه حين لا تبقى مؤسسة', async () => {
    const { org, rep, secretary } = await partnerOf();
    expect(can(await session(rep.id), 'offers:create')).toBe(true);
    expect(await db.auditLog.count({ where: { action: 'role.assign', actorId: secretary.id } })).toBeGreaterThan(0);
    await actAs(secretary.id);
    expect(await unlinkMemberAction(null, form({ organizationId: org.id, userId: rep.id }))).toMatchObject({ ok: true });
    expect(can(await session(rep.id), 'offers:create')).toBe(false);
  });

  it('حساب غير مسجّل ومن لا يملك organizations:manage مرفوضان', async () => {
    const org = await db.organization.create({ data: { name: 'مؤسسة ربط', type: 'DONOR' } });
    const secretary = await createUser(['secretary']);
    await actAs(secretary.id);
    expect(await linkMemberAction(null, form({ organizationId: org.id, email: 'nobody@example.test' }))).toMatchObject({ ok: false });
    const head = await createUser([{ key: 'committee_head', committee: 'legal-affairs' }]);
    const rep = await createUser();
    await actAs(head.id);
    expect(await linkMemberAction(null, form({ organizationId: org.id, email: rep.email! }))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/لا تملك صلاحية/),
    });
  });
});

describe('عرض الدعم وقراره — AC-10', () => {
  it('① بلا نوع مرفوض · ② غير المالي بلا مبلغ مقبول · المؤسسة لا تقدّم باسم غيرها', async () => {
    const { initiative, venue } = await published();
    const a = await partnerOf('مؤسسة أ');
    const b = await partnerOf('مؤسسة ب');
    expect(await offer(a.rep.id, { initiativeId: initiative.id, organizationId: a.org.id, types: [] })).toMatchObject({
      ok: false,
      fieldErrors: { types: expect.any(Array) },
    });
    expect(
      await offer(a.rep.id, { initiativeId: initiative.id, needId: venue.id, organizationId: a.org.id, types: ['VENUE'] }),
    ).toMatchObject({ ok: true });
    expect(await offer(b.rep.id, { initiativeId: initiative.id, organizationId: a.org.id, types: ['VENUE'] })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/لا تملك صلاحية/),
    });
  });

  it('D27: المؤسسة ترى عروضها فقط — زميل المؤسسة نفسها يرى، ومؤسسة أخرى لا', async () => {
    const { initiative } = await published();
    const a = await partnerOf('مؤسسة أ');
    const colleague = await createUser();
    await actAs(a.secretary.id);
    await linkMemberAction(null, form({ organizationId: a.org.id, email: colleague.email! }));
    const b = await partnerOf('مؤسسة ب');
    await offer(a.rep.id, { initiativeId: initiative.id, organizationId: a.org.id, types: ['EXPERTISE'] });
    const theOffer = await db.supportOffer.findFirstOrThrow({ where: { organizationId: a.org.id } });
    const members = (await db.partnerMembership.findMany({ where: { organizationId: theOffer.organizationId } })).map((m) => m.userId);
    expect(can(await session(colleague.id), 'offers:read', { ownerId: members })).toBe(true);
    expect(can(await session(b.rep.id), 'offers:read', { ownerId: members })).toBe(false);
  });

  it('القبول يضيف الشريك ويغطّي الاحتياج ولا ينشئ قيدًا · القيد يسجّله أمين الصندوق غير معتمد (D29)', async () => {
    const { president, initiative, funding } = await published();
    const a = await partnerOf();
    await offer(a.rep.id, {
      initiativeId: initiative.id,
      needId: funding.id,
      organizationId: a.org.id,
      types: ['FUNDING'],
      amount: '2000.50',
      currency: 'ILS',
    });
    const theOffer = await db.supportOffer.findFirstOrThrow({ where: { organizationId: a.org.id } });
    await actAs(president.id);
    expect(await decideOfferAction(null, form({ offerId: theOffer.id, decision: 'ACCEPTED' }))).toMatchObject({ ok: true });

    expect(await db.initiativePartner.count({ where: { initiativeId: initiative.id, organizationId: a.org.id } })).toBe(1);
    expect((await db.initiativeNeed.findUniqueOrThrow({ where: { id: funding.id } })).status).toBe('COVERED');
    expect(await db.fundingRecord.count({ where: { offerId: theOffer.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: 'offer.decide', entityId: theOffer.id } })).toBe(1);
    // ③ المؤسسة تُشعَر
    expect(await db.notification.count({ where: { userId: a.rep.id, type: 'OFFER_DECIDED' } })).toBeGreaterThan(0);

    const treasurer = await createUser(['treasurer']);
    await actAs(treasurer.id);
    expect(
      await recordFundingAction(null, form({ direction: 'INCOMING', amount: '2000.50', occurredAt: '2026-09-01', offerId: theOffer.id })),
    ).toMatchObject({ ok: true });
    const record = await db.fundingRecord.findFirstOrThrow({ where: { offerId: theOffer.id } });
    expect(record).toMatchObject({ approvedAt: null, recordedById: treasurer.id, initiativeId: initiative.id });
    expect(securedTotals(await db.fundingRecord.findMany({ where: { initiativeId: initiative.id } }))).toEqual({});

    await actAs(president.id);
    expect(await approveFundingAction(null, form({ fundingId: record.id }))).toMatchObject({ ok: true });
    expect(securedTotals(await db.fundingRecord.findMany({ where: { initiativeId: initiative.id } }))).toEqual({ ILS: '2000.50' });
  });

  it('اعتماد القيد من مسجّله مرفوض — من التطبيق ومن قاعدة البيانات (funding_four_eyes)', async () => {
    const recorder = await createUser(['treasurer', 'council_president']);
    await actAs(recorder.id);
    await recordFundingAction(null, form({ direction: 'OUTGOING', amount: '100', occurredAt: '2026-09-02' }));
    const record = await db.fundingRecord.findFirstOrThrow({ where: { recordedById: recorder.id } });
    expect(await approveFundingAction(null, form({ fundingId: record.id }))).toMatchObject({ ok: false, message: expect.stringMatching(/سجّلته بنفسك/) });
    await expect(
      db.fundingRecord.update({ where: { id: record.id }, data: { approvedById: recorder.id, approvedAt: new Date() } }),
    ).rejects.toThrow(/funding_four_eyes/);
  });

  it('أمين الصندوق لا يعتمد، والرئيس لا يسجّل', async () => {
    const treasurer = await createUser(['treasurer']);
    const president = await createUser(['council_president']);
    await actAs(president.id);
    expect(await recordFundingAction(null, form({ direction: 'INCOMING', amount: '5', occurredAt: '2026-09-02' }))).toMatchObject({ ok: false });
    await actAs(treasurer.id);
    await recordFundingAction(null, form({ direction: 'INCOMING', amount: '5', occurredAt: '2026-09-02' }));
    const record = await db.fundingRecord.findFirstOrThrow({ where: { recordedById: treasurer.id } });
    expect(await approveFundingAction(null, form({ fundingId: record.id }))).toMatchObject({ ok: false, message: expect.stringMatching(/لا تملك صلاحية/) });
  });
});

describe('الطلب و Concept Note — AC-12', () => {
  async function poll(threshold = 2) {
    const secretary = await createUser(['secretary']);
    await actAs(secretary.id);
    const title = `كيف أكون؟ ${Date.now()}`;
    expect(await createPollAction(null, form({ title, proposalThreshold: String(threshold), options: 'تصميم جرافيك\nبرمجة الويب' }))).toMatchObject({
      ok: true,
    });
    return db.demandPoll.findFirstOrThrow({ where: { title }, include: { options: { orderBy: { sortOrder: 'asc' } } } });
  }
  const vote = async (userId: string, pollId: string, optionId: string) => {
    await actAs(userId);
    return demandVoteAction(null, form({ pollId, optionId }));
  };

  it('① صوت واحد قابل للتغيير · ② بلوغ الحد مرتين = مسودة واحدة · ③ تحمل عدد المصوّتين · مهمة في لجنة المؤسسات', async () => {
    const p = await poll(2);
    const [design, web] = p.options as [(typeof p.options)[0], (typeof p.options)[0]];
    const a = await createUser(['youth']);
    const b = await createUser(['youth']);
    const c = await createUser(['youth']);
    await vote(a.id, p.id, web.id);
    await vote(a.id, p.id, design.id); // تغيير الصوت
    expect(await db.demandOption.findUniqueOrThrow({ where: { id: web.id } })).toMatchObject({ voteCount: 0 });
    expect(await vote(b.id, p.id, design.id)).toMatchObject({ ok: true, message: expect.stringMatching(/مسودة/) });
    await vote(c.id, p.id, design.id);

    const notes = await db.conceptNote.findMany({ where: { demandOptionId: design.id } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ status: 'DRAFT', voterCount: 2 });
    expect(notes[0]!.bodyMd).toContain('تصميم جرافيك');
    const committee = await committeeId('organizations-partnerships');
    expect(await db.task.count({ where: { committeeId: committee, title: { contains: 'تصميم جرافيك' } } })).toBeGreaterThan(0);
    expect(await db.demandVote.count({ where: { pollId: p.id } })).toBe(3);
  });

  it('④ إرسال مسودة غير معتمدة مرفوض · الاعتماد للرئيس وحده ثم الإرسال بسطري تدقيق', async () => {
    const p = await poll(2);
    const option = p.options[0]!;
    for (let i = 0; i < 2; i++) await vote((await createUser(['youth'])).id, p.id, option.id);
    const note = await db.conceptNote.findUniqueOrThrow({ where: { demandOptionId: option.id } });

    const president = await createUser(['council_president']);
    await actAs(president.id);
    expect(await markConceptNoteSentAction(null, form({ conceptNoteId: note.id }))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/قبل اعتماده/),
    });
    const secretary = await createUser(['secretary']);
    await actAs(secretary.id);
    expect(await approveConceptNoteAction(null, form({ conceptNoteId: note.id }))).toMatchObject({ ok: false });

    await actAs(president.id);
    expect(await approveConceptNoteAction(null, form({ conceptNoteId: note.id }))).toMatchObject({ ok: true });
    expect(await markConceptNoteSentAction(null, form({ conceptNoteId: note.id }))).toMatchObject({ ok: true });
    const done = await db.conceptNote.findUniqueOrThrow({ where: { id: note.id } });
    expect(done).toMatchObject({ status: 'SENT', approvedById: president.id });
    const actions = (await db.auditLog.findMany({ where: { entityId: note.id }, orderBy: { id: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual(['conceptnote.approve', 'conceptnote.send']);
  });

  it('من لا يملك demand:vote مرفوض، ولا تصويت على استطلاع مغلق', async () => {
    const p = await poll(5);
    const staff = await createUser(['secretary']);
    expect(await vote(staff.id, p.id, p.options[0]!.id)).toMatchObject({ ok: false, message: expect.stringMatching(/لا تملك صلاحية/) });
    await db.demandPoll.update({ where: { id: p.id }, data: { isActive: false } });
    expect(await vote((await createUser(['youth'])).id, p.id, p.options[0]!.id)).toMatchObject({ ok: false, message: expect.stringMatching(/أُغلق/) });
  });
});
