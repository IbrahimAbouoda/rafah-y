import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { listApplicants } from '@/lib/opportunities/queries';
import {
  applyAction,
  closeOpportunityAction,
  createOpportunityAction,
  reviewOpportunityAction,
  setApplicationStatusAction,
  viewApplicantAction,
  withdrawApplicationAction,
} from '@/server/actions/opportunities';
import { linkMemberAction } from '@/server/actions/organizations';
import { setConsentAction, updateProfileAction } from '@/server/actions/profile';
import { actAs, createUser, form, session } from '../support/factories';

// Sprint 4 — AC-11 · D31 (ما تراه المؤسسة) · D33 (حالة الطلب) · §6.8 (الموافقة)

async function partnerOf(orgName = 'مؤسسة فرص') {
  const org = await db.organization.create({ data: { name: `${orgName} ${Date.now()}`, type: 'LOCAL_NGO' } });
  const secretary = await createUser(['secretary']);
  const rep = await createUser([], 'ممثل مؤسسة');
  await actAs(secretary.id);
  expect(await linkMemberAction(null, form({ organizationId: org.id, email: rep.email! }))).toMatchObject({ ok: true });
  return { org, rep, secretary };
}

async function createOpportunity(repId: string, organizationId: string, fields: Record<string, string> = {}) {
  await actAs(repId);
  const res = await createOpportunityAction(
    null,
    form({
      organizationId,
      title: 'تدريب عملي في التصميم',
      description: 'تدريب عملي لثلاثة أشهر في تصميم المحتوى الرقمي لمؤسسة محلية.',
      type: 'TRAINING',
      applyMode: 'INTERNAL',
      ...fields,
    }),
  );
  expect(res).toMatchObject({ ok: true });
  return db.opportunity.findFirstOrThrow({ where: { organizationId, createdById: repId }, orderBy: { createdAt: 'desc' } });
}

async function publishedOpportunity(fields: Record<string, string> = {}) {
  const p = await partnerOf();
  const draft = await createOpportunity(p.rep.id, p.org.id, fields);
  await actAs(p.secretary.id);
  expect(await reviewOpportunityAction(null, form({ opportunityId: draft.id, decision: 'PUBLISHED' }))).toMatchObject({ ok: true });
  return { ...p, opportunity: draft };
}

async function apply(userId: string, opportunityId: string, shareProfile: boolean, message?: string) {
  await actAs(userId);
  return applyAction(null, form({ opportunityId, shareProfile: shareProfile ? 'true' : '', message }));
}

describe('نشر الفرصة — AC-11', () => {
  it('المؤسسة تنشئ PENDING_REVIEW، وأمانة السر تنشر بسطر opportunity.publish وإشعار داخلي للمؤسسة', async () => {
    const p = await partnerOf();
    const o = await createOpportunity(p.rep.id, p.org.id);
    expect(o.status).toBe('PENDING_REVIEW');
    expect(o.publishedAt).toBeNull();

    await actAs(p.secretary.id);
    expect(await reviewOpportunityAction(null, form({ opportunityId: o.id, decision: 'PUBLISHED' }))).toMatchObject({ ok: true });
    const after = await db.opportunity.findUniqueOrThrow({ where: { id: o.id } });
    expect(after).toMatchObject({ status: 'PUBLISHED', reviewedById: p.secretary.id });
    expect(after.publishedAt).not.toBeNull();
    expect(await db.auditLog.count({ where: { action: 'opportunity.publish', entityId: o.id, actorId: p.secretary.id } })).toBe(1);
    // §8.2: داخل المنصة فقط — لا بريد
    expect(await db.notification.count({ where: { userId: p.rep.id, type: 'OPPORTUNITY_PUBLISHED', channel: 'IN_APP' } })).toBe(1);
    expect(await db.notification.count({ where: { type: 'OPPORTUNITY_PUBLISHED', channel: 'EMAIL' } })).toBe(0);

    // مراجعة ثانية مرفوضة
    expect(await reviewOpportunityAction(null, form({ opportunityId: o.id, decision: 'REJECTED' }))).toMatchObject({ ok: false });
  });

  it('رفض غير المخوَّل: الشاب لا ينشئ فرصة، والمؤسسة لا تنشر، ولا تنشئ باسم مؤسسة غيرها', async () => {
    const a = await partnerOf('مؤسسة أ');
    const b = await partnerOf('مؤسسة ب');
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    const payload = {
      organizationId: a.org.id,
      title: 'فرصة دخيلة',
      description: 'وصف طويل بما يكفي لاجتياز التحقق من الطول الأدنى.',
      type: 'JOB',
      applyMode: 'INTERNAL',
    };
    expect(await createOpportunityAction(null, form(payload))).toMatchObject({ ok: false, message: expect.stringMatching(/لا تملك صلاحية/) });
    await actAs(b.rep.id);
    expect(await createOpportunityAction(null, form(payload))).toMatchObject({ ok: false, message: expect.stringMatching(/لا تملك صلاحية/) });

    const o = await createOpportunity(a.rep.id, a.org.id);
    expect(await reviewOpportunityAction(null, form({ opportunityId: o.id, decision: 'PUBLISHED' }))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/لا تملك صلاحية/),
    });
    const head = await createUser([{ key: 'committee_head', committee: 'organizations-partnerships' }]);
    await actAs(head.id);
    expect(await reviewOpportunityAction(null, form({ opportunityId: o.id, decision: 'PUBLISHED' }))).toMatchObject({ ok: false });
    expect((await db.opportunity.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('PENDING_REVIEW');
  });

  it('الفرصة الخارجية تحتاج رابطًا، والداخلية لا تحمل رابطًا', async () => {
    const p = await partnerOf();
    await actAs(p.rep.id);
    const res = await createOpportunityAction(
      null,
      form({ organizationId: p.org.id, title: 'منحة خارجية', description: 'منحة دراسية تديرها الجهة بنفسها عبر موقعها.', type: 'GRANT', applyMode: 'EXTERNAL' }),
    );
    expect(res).toMatchObject({ ok: false, fieldErrors: { externalUrl: expect.any(Array) } });
    const internal = await createOpportunity(p.rep.id, p.org.id, { externalUrl: 'https://example.org/x' });
    expect(internal.externalUrl).toBeNull();
  });
});

describe('التقديم — AC-11 ① ④ · §5.4', () => {
  it('① التقديم مرتين مرفوض', async () => {
    const { opportunity } = await publishedOpportunity();
    const youth = await createUser(['youth']);
    expect(await apply(youth.id, opportunity.id, true)).toMatchObject({ ok: true });
    expect(await apply(youth.id, opportunity.id, false)).toMatchObject({ ok: false, message: expect.stringMatching(/من قبل/) });
    expect(await db.opportunityApplication.count({ where: { opportunityId: opportunity.id } })).toBe(1);
  });

  it('④ الفرصة المنتهي موعدها لا تقبل طلبات · الخارجية لا تقبل · غير المنشورة لا تقبل', async () => {
    const youth = await createUser(['youth']);
    const { opportunity } = await publishedOpportunity();
    await db.opportunity.update({ where: { id: opportunity.id }, data: { deadline: new Date(Date.now() - 60_000) } });
    expect(await apply(youth.id, opportunity.id, true)).toMatchObject({ ok: false, message: expect.stringMatching(/انتهى موعد/) });

    const external = await publishedOpportunity({ applyMode: 'EXTERNAL', externalUrl: 'https://example.org/apply' });
    expect(await apply(youth.id, external.opportunity.id, true)).toMatchObject({ ok: false, message: expect.stringMatching(/رابط الجهة/) });

    const p = await partnerOf();
    const pending = await createOpportunity(p.rep.id, p.org.id);
    expect(await apply(youth.id, pending.id, true)).toMatchObject({ ok: false });
    expect(await db.opportunityApplication.count({ where: { applicantId: youth.id } })).toBe(0);
  });

  it('رفض غير المخوَّل: ممثل المؤسسة بلا دور شاب لا يتقدّم', async () => {
    const { opportunity, rep } = await publishedOpportunity();
    expect(await apply(rep.id, opportunity.id, true)).toMatchObject({ ok: false, message: expect.stringMatching(/لا تملك صلاحية/) });
  });
});

describe('ما تراه المؤسسة — D31 · AC-11 ② ③', () => {
  it('الموافق: القائمة بلا بيانات شخصية، والعرض الصريح يعيد الملف والتواصل ويكتب application.view', async () => {
    const { opportunity, rep } = await publishedOpportunity();
    const youth = await createUser(['youth'], 'شاب موافق');
    await actAs(youth.id);
    const skill = await db.skill.findFirstOrThrow({ where: { nameAr: 'التصميم الجرافيكي' } });
    const profile = form({ birthYear: '2002', languages: 'العربية، الإنجليزية', interests: 'التصوير', jobSeeking: 'on' });
    profile.set(`skill:${skill.id}`, 'ADVANCED');
    expect(await updateProfileAction(null, profile)).toMatchObject({ ok: true });
    expect(await apply(youth.id, opportunity.id, true, 'أعمل في التصميم منذ سنتين.')).toMatchObject({ ok: true });

    const repSession = await actAs(rep.id);
    const rows = (await listApplicants(db, repSession!, [opportunity])).get(opportunity.id)!;
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual(['createdAt', 'id', 'nextStatuses', 'number', 'shareProfile', 'status']);
    expect(rows[0]).toMatchObject({ shareProfile: true, status: 'SUBMITTED' });

    const view = await viewApplicantAction(null, form({ applicationId: rows[0]!.id }));
    expect(view).toMatchObject({
      ok: true,
      data: {
        fullName: youth.fullName,
        email: youth.email,
        birthYear: 2002,
        languages: ['العربية', 'الإنجليزية'],
        jobSeeking: true,
        skills: [{ name: 'التصميم الجرافيكي', level: 'ADVANCED' }],
        message: 'أعمل في التصميم منذ سنتين.',
      },
    });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'application.view', entityId: rows[0]!.id } });
    expect(audit.actorId).toBe(rep.id);
    // القيم الشخصية لا تُنسخ إلى التدقيق
    expect(JSON.stringify(audit.after)).not.toContain(youth.email!);
  });

  it('② غير الموافق: الطلب يظهر بلا بيانات، والعرض مرفوض بلا سطر تدقيق، ولا تُدار حالته', async () => {
    const { opportunity, rep } = await publishedOpportunity();
    const youth = await createUser(['youth']);
    expect(await apply(youth.id, opportunity.id, false, 'رسالة لا تصل')).toMatchObject({ ok: true });
    const repSession = await actAs(rep.id);
    const [row] = (await listApplicants(db, repSession!, [opportunity])).get(opportunity.id)!;
    expect(row).toMatchObject({ shareProfile: false, nextStatuses: [] });

    const view = await viewApplicantAction(null, form({ applicationId: row!.id }));
    expect(view).toMatchObject({ ok: false, message: expect.stringMatching(/لم يوافق/) });
    expect(view?.data).toBeUndefined();
    expect(await db.auditLog.count({ where: { action: 'application.view', entityId: row!.id } })).toBe(0);
    expect(await setApplicationStatusAction(null, form({ applicationId: row!.id, toStatus: 'ACCEPTED' }))).toMatchObject({ ok: false });
  });

  it('مؤسسة أخرى وشاب آخر لا يقرآن المتقدّم؛ والرئيس (الكل) يقرأ بسطر تدقيق', async () => {
    const { opportunity } = await publishedOpportunity();
    const youth = await createUser(['youth']);
    await apply(youth.id, opportunity.id, true);
    const application = await db.opportunityApplication.findFirstOrThrow({ where: { opportunityId: opportunity.id } });

    const other = await partnerOf('مؤسسة منافسة');
    const otherSession = await actAs(other.rep.id);
    expect((await listApplicants(db, otherSession!, [opportunity])).has(opportunity.id)).toBe(false);
    expect(await viewApplicantAction(null, form({ applicationId: application.id }))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/لا تملك صلاحية/),
    });
    const stranger = await createUser(['youth']);
    await actAs(stranger.id);
    expect(await viewApplicantAction(null, form({ applicationId: application.id }))).toMatchObject({ ok: false });
    expect(await db.auditLog.count({ where: { action: 'application.view', entityId: application.id } })).toBe(0);

    const president = await createUser(['council_president']);
    await actAs(president.id);
    expect(await viewApplicantAction(null, form({ applicationId: application.id }))).toMatchObject({ ok: true });
    expect(await db.auditLog.count({ where: { action: 'application.view', entityId: application.id, actorId: president.id } })).toBe(1);
  });
});

describe('حالة الطلب والسحب — D33 · §8.2', () => {
  it('المؤسسة تقبل الطلب فيُشعَر المتقدّم داخل المنصة وبالبريد؛ المحسوم لا يُنقل ولا يُسحب', async () => {
    const { opportunity, rep } = await publishedOpportunity();
    const youth = await createUser(['youth']);
    await apply(youth.id, opportunity.id, true);
    const application = await db.opportunityApplication.findFirstOrThrow({ where: { opportunityId: opportunity.id } });

    await actAs(rep.id);
    expect(await setApplicationStatusAction(null, form({ applicationId: application.id, toStatus: 'UNDER_REVIEW' }))).toMatchObject({ ok: true });
    expect(await setApplicationStatusAction(null, form({ applicationId: application.id, toStatus: 'ACCEPTED' }))).toMatchObject({ ok: true });
    expect(await setApplicationStatusAction(null, form({ applicationId: application.id, toStatus: 'REJECTED' }))).toMatchObject({ ok: false });
    expect(await db.notification.count({ where: { userId: youth.id, type: 'APPLICATION_STATUS_CHANGED', channel: 'IN_APP' } })).toBe(2);
    expect(await db.notification.count({ where: { userId: youth.id, type: 'APPLICATION_STATUS_CHANGED', channel: 'EMAIL' } })).toBe(2);

    await actAs(youth.id);
    expect(await withdrawApplicationAction(null, form({ applicationId: application.id }))).toMatchObject({ ok: false });
  });

  it('المتقدّم يسحب طلبه، وغيره لا يسحبه، والمسحوب لا تُقرأ بياناته', async () => {
    const { opportunity, rep } = await publishedOpportunity();
    const youth = await createUser(['youth']);
    await apply(youth.id, opportunity.id, true);
    const application = await db.opportunityApplication.findFirstOrThrow({ where: { opportunityId: opportunity.id } });

    const other = await createUser(['youth']);
    await actAs(other.id);
    expect(await withdrawApplicationAction(null, form({ applicationId: application.id }))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/لا تملك صلاحية/),
    });
    await actAs(youth.id);
    expect(await withdrawApplicationAction(null, form({ applicationId: application.id }))).toMatchObject({ ok: true });
    await actAs(rep.id);
    expect(await viewApplicantAction(null, form({ applicationId: application.id }))).toMatchObject({ ok: false, message: expect.stringMatching(/سحب/) });
  });

  it('إغلاق الفرصة من مؤسستها يوقف الطلبات؛ ومؤسسة أخرى لا تغلقها', async () => {
    const { opportunity, rep } = await publishedOpportunity();
    const other = await partnerOf('مؤسسة ثالثة');
    await actAs(other.rep.id);
    expect(await closeOpportunityAction(null, form({ opportunityId: opportunity.id }))).toMatchObject({ ok: false });
    await actAs(rep.id);
    expect(await closeOpportunityAction(null, form({ opportunityId: opportunity.id }))).toMatchObject({ ok: true });
    const youth = await createUser(['youth']);
    expect(await apply(youth.id, opportunity.id, true)).toMatchObject({ ok: false });
  });
});

describe('الموافقة العامة — §6.8', () => {
  it('سحب shareWithPartners مؤرّخ ولا يحذف طلبًا سابقًا ولا يغيّر موافقته', async () => {
    const { opportunity } = await publishedOpportunity();
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    expect(await setConsentAction(null, form({ shareWithPartners: 'true' }))).toMatchObject({ ok: true });
    const granted = await db.youthProfile.findUniqueOrThrow({ where: { userId: youth.id } });
    expect(granted.shareWithPartners).toBe(true);
    expect(granted.consentUpdatedAt).not.toBeNull();

    expect(await apply(youth.id, opportunity.id, true)).toMatchObject({ ok: true });
    await actAs(youth.id);
    expect(await setConsentAction(null, form({ shareWithPartners: '' }))).toMatchObject({ ok: true, message: expect.stringMatching(/طلباتك السابقة/) });
    const revoked = await db.youthProfile.findUniqueOrThrow({ where: { userId: youth.id } });
    expect(revoked.shareWithPartners).toBe(false);
    expect(revoked.consentUpdatedAt!.getTime()).toBeGreaterThanOrEqual(granted.consentUpdatedAt!.getTime());
    expect(await db.opportunityApplication.findFirstOrThrow({ where: { applicantId: youth.id } })).toMatchObject({ shareProfile: true });
  });

  it('رفض غير المخوَّل: حساب بلا دور شاب لا يعدّل ملفًا', async () => {
    const nobody = await createUser([]);
    await actAs(nobody.id);
    expect(await updateProfileAction(null, form({ languages: '', interests: '' }))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/لا تملك صلاحية/),
    });
    expect(await setConsentAction(null, form({ shareWithPartners: 'true' }))).toMatchObject({ ok: false });
    expect(await session(nobody.id)).toBeTruthy();
  });

  it('المهارات تُستبدل بالحفظ: المحذوفة من النموذج تُحذف', async () => {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    const [a, b] = await db.skill.findMany({ take: 2, orderBy: { nameAr: 'asc' } });
    const first = form({ languages: '', interests: '' });
    first.set(`skill:${a!.id}`, 'BEGINNER');
    first.set(`skill:${b!.id}`, 'INTERMEDIATE');
    expect(await updateProfileAction(null, first)).toMatchObject({ ok: true });
    const second = form({ languages: '', interests: '' });
    second.set(`skill:${b!.id}`, 'ADVANCED');
    expect(await updateProfileAction(null, second)).toMatchObject({ ok: true });
    expect(await db.youthSkill.findMany({ where: { userId: youth.id }, select: { skillId: true, level: true } })).toEqual([
      { skillId: b!.id, level: 'ADVANCED' },
    ]);
  });
});
