import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { verifyAccessCode } from '@/lib/complaints/access-code';
import { readableComplaints } from '@/lib/complaints/queries';
import { decryptField } from '@/lib/crypto';
import { db } from '@/lib/db';
import { readContactAction } from '@/server/actions/complaints/contact';
import { submitComplaintAction, submitPublicComplaintAction } from '@/server/actions/complaints/submit';
import { trackComplaintAction } from '@/server/actions/complaints/track';
import {
  assignToCommitteeAction,
  closeComplaintAction,
  dismissComplaintAction,
  openForTriageAction,
  referComplaintAction,
  updateStatusAction,
} from '@/server/actions/complaints/workflow';
import { markAllReadAction, markReadAction } from '@/server/actions/notifications';
import { actAs, categoryId, committeeId, createUser, form, freshIp, session } from '../support/factories';

// Sprint 1 — تكامل: كل Server Action في الشكاوى، بمسارها السعيد ورفض غير المخوَّل (DoD §17 بند 11)

const TRACK_FAIL = /لم نجد شكوى بهذا الرقم وهذا الرمز معًا/;

async function input(overrides: Record<string, unknown> = {}) {
  return {
    clientDraftId: randomUUID(),
    title: 'انقطاع الإنارة في الشارع',
    body: 'الإنارة معطلة منذ أسبوعين في الشارع الرئيسي، والمكان مظلم ليلًا.',
    categoryId: await categoryId(),
    ...overrides,
  };
}

/** يقدّم شكوى من شاب جديد ويعيد الرقم والرمز */
async function submitted(overrides: Record<string, unknown> = {}) {
  const youth = await createUser(['youth'], 'شاب');
  await actAs(youth.id);
  const res = await submitComplaintAction(await input(overrides));
  if (!res?.ok || !res.data) throw new Error(`submit failed: ${res?.message}`);
  const complaint = await db.complaint.findUniqueOrThrow({ where: { id: res.data.id } });
  return { youth, complaint, code: res.data.accessCode, reference: res.data.reference };
}

async function track(reference: string, accessCode: string) {
  return trackComplaintAction(null, form({ reference, accessCode }));
}

/** ينقل شكوى إلى ASSIGNED في لجنة معيّنة عبر أمين السر */
async function assignedTo(slug: string, overrides: Record<string, unknown> = {}) {
  const s = await submitted(overrides);
  const secretary = await createUser(['secretary'], 'أمين سر');
  await actAs(secretary.id);
  expect(await openForTriageAction(null, form({ complaintId: s.complaint.id }))).toMatchObject({ ok: true });
  const committee = await committeeId(slug);
  expect(await assignToCommitteeAction(null, form({ complaintId: s.complaint.id, committeeId: committee }))).toMatchObject({
    ok: true,
  });
  return { ...s, secretary, committee };
}

beforeEach(() => {
  freshIp();
});

describe('submitComplaintAction — AC-01', () => {
  it('ينشئ SUBMITTED برقم RF-CMP-YYYY-NNNNNN وحدث عام وسطر تدقيق وإشعار، ويشفّر التواصل', async () => {
    const youth = await createUser(['youth'], 'شاب');
    await actAs(youth.id);
    const res = await submitComplaintAction(
      await input({ contactName: 'اسم تجريبي', contactPhone: '0599000001', preferredChannel: 'PHONE' }),
    );
    expect(res).toMatchObject({ ok: true });
    const { id, reference, accessCode } = res!.data!;
    expect(reference).toMatch(/^RF-CMP-\d{4}-\d{6}$/);
    expect(accessCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const c = await db.complaint.findUniqueOrThrow({ where: { id }, include: { contact: true, events: true } });
    expect(c).toMatchObject({ status: 'SUBMITTED', submitterId: youth.id, isAnonymous: false, isDemo: false });
    // ③ الرمز لا يُخزَّن ولا يظهر في أي سجل — تجزئته فقط
    expect(c.accessCodeHash).not.toContain(accessCode.replace('-', ''));
    expect(await verifyAccessCode(accessCode, c.accessCodeHash)).toBe(true);
    expect(c.events).toHaveLength(1);
    expect(c.events[0]).toMatchObject({ toStatus: 'SUBMITTED', isPublic: true, actorId: youth.id });

    // §6.6: البايتات المخزّنة لا تحوي النص، وتُفك بالمفتاح
    const phone = c.contact!.phoneEnc!;
    expect(Buffer.from(phone).toString('utf8')).not.toContain('0599000001');
    expect(decryptField(phone)).toBe('0599000001');

    // ⑤ سطر التدقيق في نفس المعاملة، بلا IP وبلا تجزئة الرمز
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'complaint.create', entityId: id } });
    expect(audit).toMatchObject({ actorId: youth.id, ip: null });
    expect(JSON.stringify(audit.after)).not.toContain('scrypt');

    const n = await db.notification.findMany({ where: { userId: youth.id, type: 'COMPLAINT_RECEIVED' } });
    expect(n.map((x) => x.channel).sort()).toEqual(['EMAIL', 'IN_APP']);
  });

  it('① الحقول الناقصة تُرفض برسالة عربية لكل حقل ولا يُنشأ شيء', async () => {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    const before = await db.complaint.count();
    const res = await submitComplaintAction({ clientDraftId: randomUUID(), title: '', body: 'قصير', categoryId: '' });
    expect(res).toMatchObject({ ok: false });
    expect(Object.keys(res!.fieldErrors ?? {}).sort()).toEqual(['body', 'categoryId', 'title']);
    expect(await db.complaint.count()).toBe(before);
  });

  it('المجهولة: submitterId = NULL، ولا يُربط الحساب لا بالحدث ولا بالتدقيق ولا بالإشعار (§6.7)', async () => {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    const res = await submitComplaintAction(await input({ isAnonymous: 'on' }));
    const c = await db.complaint.findUniqueOrThrow({ where: { id: res!.data!.id }, include: { events: true, contact: true } });
    expect(c).toMatchObject({ isAnonymous: true, submitterId: null, contact: null });
    expect(c.events[0]!.actorId).toBeNull();
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'complaint.create', entityId: c.id } });
    expect(audit).toMatchObject({ actorId: null, actorRoles: ['system:anonymous'], ip: null });
    expect(await db.notification.count({ where: { userId: youth.id } })).toBe(0);
  });

  it('يرفض غير المسجّل ومن لا يملك complaints:create قبل معالجة المدخلات', async () => {
    await actAs(null);
    expect(await submitComplaintAction(await input())).toMatchObject({ ok: false, message: expect.stringMatching(/سجّل الدخول/) });
    const observer = await createUser(['municipality_observer']);
    await actAs(observer.id);
    // مدخل فاسد عمدًا: الرفض بالصلاحية يأتي قبل Zod
    expect(await submitComplaintAction({ junk: true })).toMatchObject({ ok: false, message: expect.stringMatching(/لا تملك صلاحية/) });
  });

  it('④ إرسالات متزامنة لا تنتج رقمًا مكررًا', async () => {
    const users = await Promise.all(Array.from({ length: 6 }, () => createUser(['youth'])));
    const results = await Promise.all(
      users.map(async (u) => {
        const s = await session(u.id);
        const { submitComplaint } = await import('@/lib/complaints/create');
        const { SubmitComplaintSchema } = await import('@/lib/validation/complaints');
        return submitComplaint(SubmitComplaintSchema.parse(await input()), { kind: 'account', user: s });
      }),
    );
    expect(new Set(results.map((r) => r.reference)).size).toBe(6);
  });

  it('AC-17 ②: ثلاث محاولات بنفس clientDraftId = شكوى واحدة برقم واحد، والرمز الأخير هو الصالح', async () => {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    const payload = await input();
    const a = await submitComplaintAction(payload);
    const b = await submitComplaintAction(payload);
    const c = await submitComplaintAction(payload);
    expect(new Set([a, b, c].map((r) => r!.data!.reference)).size).toBe(1);
    expect(await db.complaint.count({ where: { clientDraftId: payload.clientDraftId } })).toBe(1);
    expect([b, c].every((r) => r!.data!.duplicate)).toBe(true);
    // الإعادة لا تستهلك حد المعدل: شكوى جديدة ما زالت ممكنة
    expect(await submitComplaintAction(await input())).toMatchObject({ ok: true });

    const stored = await db.complaint.findUniqueOrThrow({ where: { clientDraftId: payload.clientDraftId } });
    expect(await verifyAccessCode(c!.data!.accessCode, stored.accessCodeHash)).toBe(true);
    expect(await verifyAccessCode(a!.data!.accessCode, stored.accessCodeHash)).toBe(false);
  });

  it('clientDraftId مستخدم من حساب آخر يُرفض ولا يكشف الشكوى', async () => {
    const { complaint } = await submitted();
    const other = await createUser(['youth']);
    await actAs(other.id);
    const res = await submitComplaintAction(await input({ clientDraftId: complaint.clientDraftId }));
    expect(res).toMatchObject({ ok: false });
    expect(res?.data).toBeUndefined();
  });

  it('حد المعدل: 3 شكاوى لكل حساب في الساعة (§6.4)', async () => {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    for (let i = 0; i < 3; i++) expect(await submitComplaintAction(await input())).toMatchObject({ ok: true });
    expect(await submitComplaintAction(await input())).toMatchObject({ ok: false, message: expect.stringMatching(/محاولات كثيرة/) });
  });
});

describe('submitPublicComplaintAction — شكوى زائر (D1 · D21)', () => {
  it('بلا حساب: submitterId = NULL دائمًا، والتدقيق بمصدر public وبلا IP', async () => {
    await actAs(null);
    const res = await submitPublicComplaintAction(await input({ contactName: 'زائر تجريبي', contactEmail: 'visitor@example.test' }));
    expect(res).toMatchObject({ ok: true });
    const c = await db.complaint.findUniqueOrThrow({ where: { id: res!.data!.id }, include: { contact: true } });
    expect(c).toMatchObject({ submitterId: null, isAnonymous: false });
    expect(c.contact?.emailEnc).toBeTruthy();
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'complaint.create', entityId: c.id } });
    expect(audit).toMatchObject({ actorId: null, actorRoles: ['system:public'], ip: null });
  });

  it('الحد أشد من الحساب: 2 لكل IP في الساعة', async () => {
    await actAs(null);
    freshIp();
    expect(await submitPublicComplaintAction(await input())).toMatchObject({ ok: true });
    expect(await submitPublicComplaintAction(await input())).toMatchObject({ ok: true });
    expect(await submitPublicComplaintAction(await input())).toMatchObject({ ok: false, message: expect.stringMatching(/محاولات كثيرة/) });
    freshIp();
    expect(await submitPublicComplaintAction(await input())).toMatchObject({ ok: true });
  });
});

describe('trackComplaintAction — AC-02', () => {
  it('يعرض الحالة واللجنة والأحداث العامة فقط — بلا ملاحظات داخلية ولا منفّذين ولا تواصل', async () => {
    const s = await assignedTo('health-affairs', { contactPhone: '0599000002' });
    const head = await createUser([{ key: 'committee_head', committee: 'health-affairs' }], 'رئيس لجنة');
    await actAs(head.id);
    await updateStatusAction(null, form({ complaintId: s.complaint.id, toStatus: 'COMMITTEE_REVIEW', note: 'ملاحظة داخلية سرية' }));

    await actAs(null);
    const res = await track(s.reference, s.code);
    expect(res).toMatchObject({ ok: true, data: { status: 'COMMITTEE_REVIEW', committee: 'اللجنة الصحية' } });
    const json = JSON.stringify(res);
    expect(json).not.toContain('ملاحظة داخلية سرية');
    expect(json).not.toContain('0599000002');
    expect(json).not.toContain(head.fullName);
    expect(json).not.toContain('actor');
    // الانتقال بملاحظة داخلية لا يظهر حدثه أصلًا
    expect(res!.data!.events.map((e) => e.toStatus)).toEqual(['SUBMITTED', 'UNDER_REVIEW', 'ASSIGNED']);
    expect((await db.complaint.findUniqueOrThrow({ where: { id: s.complaint.id } })).firstTrackedAt).not.toBeNull();
  });

  it('① رمز خاطئ ورقم غير موجود: رسالة واحدة لا تكشف أيهما', async () => {
    const s = await submitted();
    await actAs(null);
    const wrongCode = await track(s.reference, 'AAAA-AAAA');
    const wrongRef = await track('RF-CMP-2026-999999', s.code);
    expect(wrongCode).toMatchObject({ ok: false, message: expect.stringMatching(TRACK_FAIL) });
    expect(wrongRef?.message).toBe(wrongCode?.message);
    expect(wrongCode?.data).toBeUndefined();
  });

  it('③ الشكوى المجهولة تُتابَع بالطريقة نفسها', async () => {
    const s = await submitted({ isAnonymous: 'on' });
    await actAs(null);
    expect(await track(s.reference, s.code)).toMatchObject({ ok: true, data: { status: 'SUBMITTED' } });
  });

  it('④ 10 محاولات لكل IP في الساعة، ثم رفض حتى مع الرمز الصحيح', async () => {
    const s = await submitted();
    await actAs(null);
    freshIp();
    for (let i = 0; i < 10; i++) await track(s.reference, 'ZZZZ-ZZZZ');
    expect(await track(s.reference, s.code)).toMatchObject({ ok: false, message: expect.stringMatching(/محاولات كثيرة/) });
  });
});

describe('الفرز والتحويل — AC-03', () => {
  it('أمين السر يفتح ويحوّل: committeeId + ASSIGNED + حدث عام + تدقيق بالمنفّذ واللجنة + إشعار رئيس اللجنة', async () => {
    const head = await createUser([{ key: 'committee_head', committee: 'legal-affairs' }]);
    const member = await createUser([{ key: 'committee_member', committee: 'legal-affairs' }]);
    const s = await assignedTo('legal-affairs');

    const c = await db.complaint.findUniqueOrThrow({ where: { id: s.complaint.id }, include: { events: true } });
    expect(c).toMatchObject({ status: 'ASSIGNED', committeeId: s.committee });
    expect(c.events.find((e) => e.toStatus === 'ASSIGNED')).toMatchObject({ isPublic: true, actorId: s.secretary.id });

    const triage = await db.auditLog.findFirstOrThrow({ where: { action: 'complaint.triage', entityId: c.id } });
    expect(triage.actorId).toBe(s.secretary.id);
    const assign = await db.auditLog.findFirstOrThrow({ where: { action: 'complaint.assign', entityId: c.id } });
    expect(assign).toMatchObject({ actorId: s.secretary.id, actorRoles: ['secretary'] });
    expect(assign.after).toMatchObject({ committeeId: s.committee, status: 'ASSIGNED' });

    // «رئيس اللجنة» = من يملك update_status بنطاق هذه اللجنة؛ العضو لا
    expect(await db.notification.count({ where: { userId: head.id, type: 'COMPLAINT_ASSIGNED' } })).toBe(2);
    expect(await db.notification.count({ where: { userId: member.id } })).toBe(0);
    // المقدّم يُشعَر داخل المنصة فقط بالتحويل (§8.2)
    const toSubmitter = await db.notification.findMany({ where: { userId: s.youth.id, type: 'COMPLAINT_ASSIGNED' } });
    expect(toSubmitter.map((n) => n.channel)).toEqual(['IN_APP']);

    // ② رئيس اللجنة يرى الشكوى في نطاقه فورًا
    const scope = readableComplaints(await session(head.id))!;
    expect(await db.complaint.count({ where: { AND: [scope, { id: c.id }] } })).toBe(1);
  });

  it('① التحويل بلا لجنة مرفوض · لجنة معطّلة مرفوضة', async () => {
    const s = await submitted();
    const secretary = await createUser(['secretary']);
    await actAs(secretary.id);
    await openForTriageAction(null, form({ complaintId: s.complaint.id }));
    expect(await assignToCommitteeAction(null, form({ complaintId: s.complaint.id }))).toMatchObject({
      ok: false,
      fieldErrors: { committeeId: expect.any(Array) },
    });
    const off = await db.committee.create({ data: { slug: `off-${randomUUID().slice(0, 6)}`, nameAr: 'لجنة معطّلة', isActive: false } });
    expect(await assignToCommitteeAction(null, form({ complaintId: s.complaint.id, committeeId: off.id }))).toMatchObject({ ok: false });
    expect((await db.complaint.findUniqueOrThrow({ where: { id: s.complaint.id } })).status).toBe('UNDER_REVIEW');
  });

  it('رئيس اللجنة لا يفرز · التحويل قبل الفتح مرفوض من جدول الانتقالات', async () => {
    const s = await submitted();
    const head = await createUser([{ key: 'committee_head', committee: 'legal-affairs' }]);
    await actAs(head.id);
    expect(await openForTriageAction(null, form({ complaintId: s.complaint.id }))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/لا تملك صلاحية/),
    });
    const secretary = await createUser(['secretary']);
    await actAs(secretary.id);
    const res = await assignToCommitteeAction(null, form({ complaintId: s.complaint.id, committeeId: await committeeId('legal-affairs') }));
    expect(res).toMatchObject({ ok: false, message: expect.stringMatching(/لا يمكن نقل الشكوى/) });
  });
});

describe('تحديث الحالة من اللجنة — AC-04', () => {
  it('المسار الكامل برئيس اللجنة: دراسة ← إحالة ← انتظار ← رد ← معالجة ← حل، ثم إغلاق بأمين السر', async () => {
    const s = await assignedTo('logistical-support');
    const head = await createUser([{ key: 'committee_head', committee: 'logistical-support' }]);
    await actAs(head.id);
    const id = s.complaint.id;

    expect(await updateStatusAction(null, form({ complaintId: id, toStatus: 'COMMITTEE_REVIEW', isPublic: 'on', note: 'اللجنة تدرس الشكوى' }))).toMatchObject({ ok: true });
    expect(
      await referComplaintAction(null, form({ complaintId: id, target: 'MUNICIPALITY', targetName: 'بلدية تجريبية', note: 'تواصل مع قسم الإنارة' })),
    ).toMatchObject({ ok: true });
    expect(await updateStatusAction(null, form({ complaintId: id, toStatus: 'WAITING_RESPONSE' }))).toMatchObject({ ok: true });
    expect(
      await updateStatusAction(null, form({ complaintId: id, toStatus: 'IN_PROGRESS', response: 'البلدية حدّدت موعد الصيانة' })),
    ).toMatchObject({ ok: true });
    expect(await updateStatusAction(null, form({ complaintId: id, toStatus: 'RESOLVED', note: 'أُصلحت الإنارة في الشارع كله.' }))).toMatchObject({ ok: true });

    const referral = await db.complaintReferral.findFirstOrThrow({ where: { complaintId: id } });
    expect(referral).toMatchObject({ targetName: 'بلدية تجريبية', response: 'البلدية حدّدت موعد الصيانة', createdById: head.id });
    expect(referral.respondedAt).not.toBeNull();

    // الإغلاق: complaints:close بنطاق اللجنة لرئيسها أيضًا
    await actAs(s.secretary.id);
    expect(await closeComplaintAction(null, form({ complaintId: id }))).toMatchObject({ ok: true });
    const c = await db.complaint.findUniqueOrThrow({ where: { id } });
    expect(c).toMatchObject({ status: 'CLOSED', resolutionNote: 'أُصلحت الإنارة في الشارع كله.' });
    expect(c.closedAt).not.toBeNull();

    // ④ سطر تدقيق بكل انتقال
    const actions = (await db.auditLog.findMany({ where: { entityId: id }, orderBy: { id: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual([
      'complaint.create',
      'complaint.triage',
      'complaint.assign',
      'complaint.status_change',
      'complaint.refer',
      'complaint.status_change',
      'complaint.status_change',
      'complaint.status_change',
      'complaint.close',
    ]);
    // المقدّم أُشعر بالحل والإغلاق
    expect(await db.notification.count({ where: { userId: s.youth.id, type: 'COMPLAINT_RESOLVED', channel: 'IN_APP' } })).toBe(2);
  });

  it('① رئيس لجنة أخرى يُرفض على الخادم حتى بالمعرّف الصحيح', async () => {
    const s = await assignedTo('health-affairs');
    const otherHead = await createUser([{ key: 'committee_head', committee: 'sports-arts' }]);
    await actAs(otherHead.id);
    for (const res of [
      await updateStatusAction(null, form({ complaintId: s.complaint.id, toStatus: 'COMMITTEE_REVIEW' })),
      await closeComplaintAction(null, form({ complaintId: s.complaint.id })),
      await readContactAction(null, form({ complaintId: s.complaint.id })),
    ]) {
      expect(res).toMatchObject({ ok: false, message: expect.stringMatching(/لا تملك صلاحية/) });
    }
    expect((await db.complaint.findUniqueOrThrow({ where: { id: s.complaint.id } })).status).toBe('ASSIGNED');
  });

  it('عضو اللجنة يقرأ ولا يحدّث · الانتقال غير المسموح مرفوض · الحل بلا ملاحظة مرفوض', async () => {
    const s = await assignedTo('women-empowerment');
    const member = await createUser([{ key: 'committee_member', committee: 'women-empowerment' }]);
    await actAs(member.id);
    expect(await updateStatusAction(null, form({ complaintId: s.complaint.id, toStatus: 'COMMITTEE_REVIEW' }))).toMatchObject({ ok: false });

    const head = await createUser([{ key: 'committee_head', committee: 'women-empowerment' }]);
    await actAs(head.id);
    expect(await updateStatusAction(null, form({ complaintId: s.complaint.id, toStatus: 'CLOSED' }))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/لا يمكن نقل الشكوى/),
    });
    await updateStatusAction(null, form({ complaintId: s.complaint.id, toStatus: 'COMMITTEE_REVIEW' }));
    await updateStatusAction(null, form({ complaintId: s.complaint.id, toStatus: 'IN_PROGRESS' }));
    expect(await updateStatusAction(null, form({ complaintId: s.complaint.id, toStatus: 'RESOLVED' }))).toMatchObject({
      ok: false,
      fieldErrors: { note: expect.any(Array) },
    });
  });

  it('② الملاحظة الداخلية لا تصل /track ولا نص الإشعار', async () => {
    const s = await assignedTo('health-affairs');
    const head = await createUser([{ key: 'committee_head', committee: 'health-affairs' }]);
    await actAs(head.id);
    await updateStatusAction(null, form({ complaintId: s.complaint.id, toStatus: 'COMMITTEE_REVIEW', note: 'لا تنشر: اسم الموظف المقصّر' }));
    const n = await db.notification.findFirstOrThrow({
      where: { userId: s.youth.id, type: 'COMPLAINT_STATUS_CHANGED', title: { contains: 'تدرسها اللجنة' } },
    });
    expect(n.body).toBeNull();
    await actAs(null);
    expect(JSON.stringify(await track(s.reference, s.code))).not.toContain('الموظف المقصّر');
  });

  it('تغيير متزامن: الثاني يُرفض ولا يكتب حدثًا مزدوجًا', async () => {
    const s = await assignedTo('sports-arts');
    const head = await createUser([{ key: 'committee_head', committee: 'sports-arts' }]);
    await actAs(head.id);
    const [a, b] = await Promise.all([
      updateStatusAction(null, form({ complaintId: s.complaint.id, toStatus: 'COMMITTEE_REVIEW' })),
      updateStatusAction(null, form({ complaintId: s.complaint.id, toStatus: 'COMMITTEE_REVIEW' })),
    ]);
    expect([a?.ok, b?.ok].sort()).toEqual([false, true]);
    expect(await db.complaintEvent.count({ where: { complaintId: s.complaint.id, toStatus: 'COMMITTEE_REVIEW' } })).toBe(1);
  });
});

describe('الاستبعاد — §5.1 خطوة 12 · AC-04 ③', () => {
  it('السبب إلزامي في التطبيق، ويصل المقدّم علنًا', async () => {
    const s = await submitted();
    const secretary = await createUser(['secretary']);
    await actAs(secretary.id);
    await openForTriageAction(null, form({ complaintId: s.complaint.id }));
    expect(await dismissComplaintAction(null, form({ complaintId: s.complaint.id, reason: '' }))).toMatchObject({
      ok: false,
      fieldErrors: { reason: expect.any(Array) },
    });
    expect(
      await dismissComplaintAction(null, form({ complaintId: s.complaint.id, reason: 'مكررة مع شكوى سابقة في نفس الموضوع.' })),
    ).toMatchObject({ ok: true });
    const c = await db.complaint.findUniqueOrThrow({ where: { id: s.complaint.id } });
    expect(c).toMatchObject({ status: 'DISMISSED', dismissReason: 'مكررة مع شكوى سابقة في نفس الموضوع.' });
    await actAs(null);
    expect((await track(s.reference, s.code))!.data!.events.at(-1)).toMatchObject({ toStatus: 'DISMISSED', note: c.dismissReason });
  });

  it('وقاعدة البيانات نفسها ترفض الاستبعاد بلا سبب لو تجاوز أحدهم التطبيق', async () => {
    const s = await submitted();
    await expect(db.complaint.update({ where: { id: s.complaint.id }, data: { status: 'DISMISSED' } })).rejects.toThrow(
      /complaints_dismissed_needs_reason/,
    );
  });
});

describe('readContactAction — §6.6', () => {
  it('رئيس اللجنة يقرأ، وكل قراءة تكتب complaint.contact_read بلا القيم نفسها', async () => {
    const s = await assignedTo('legal-affairs', { contactName: 'اسم تجريبي', contactPhone: '0599000003' });
    const head = await createUser([{ key: 'committee_head', committee: 'legal-affairs' }]);
    await actAs(head.id);
    const res = await readContactAction(null, form({ complaintId: s.complaint.id }));
    expect(res).toMatchObject({ ok: true, data: { name: 'اسم تجريبي', phone: '0599000003', anonymous: false } });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'complaint.contact_read', entityId: s.complaint.id } });
    expect(audit.actorId).toBe(head.id);
    expect(JSON.stringify(audit.after)).not.toContain('0599000003');
  });

  it('مراقب البلدية وعضو اللجنة لا يتلقيان بيانات التواصل (§3.4 · AC-14 ②)', async () => {
    const s = await assignedTo('legal-affairs', { contactPhone: '0599000004' });
    for (const roles of [['municipality_observer'], [{ key: 'committee_member', committee: 'legal-affairs' }]] as const) {
      const u = await createUser([...roles]);
      await actAs(u.id);
      const res = await readContactAction(null, form({ complaintId: s.complaint.id }));
      expect(res).toMatchObject({ ok: false });
      expect(JSON.stringify(res)).not.toContain('0599000004');
    }
  });
});

describe('الإشعارات — markRead · markAllRead', () => {
  it('يعلّم إشعاراته فقط؛ إشعار غيره = غير موجود', async () => {
    const s = await submitted();
    const mine = await db.notification.findFirstOrThrow({ where: { userId: s.youth.id, channel: 'IN_APP' } });
    const other = await createUser(['youth']);
    await actAs(other.id);
    expect(await markReadAction(null, form({ notificationId: mine.id }))).toMatchObject({ ok: false });
    expect((await db.notification.findUniqueOrThrow({ where: { id: mine.id } })).readAt).toBeNull();

    await actAs(s.youth.id);
    expect(await markReadAction(null, form({ notificationId: mine.id }))).toMatchObject({ ok: true });
    expect((await db.notification.findUniqueOrThrow({ where: { id: mine.id } })).readAt).not.toBeNull();
    expect(await markAllReadAction()).toMatchObject({ ok: true });
    expect(await db.notification.count({ where: { userId: s.youth.id, channel: 'IN_APP', readAt: null } })).toBe(0);
  });

  it('غير المسجّل مرفوض', async () => {
    await actAs(null);
    expect(await markAllReadAction()).toMatchObject({ ok: false });
  });
});

describe('موعد متابعة التحويل — D23 (Q16)', () => {
  it('يُضبط عند التحويل، ويرفض تاريخًا ماضيًا، وتحدّثه اللجنة، والحل ينهيه', async () => {
    const s = await submitted();
    const secretary = await createUser(['secretary']);
    await actAs(secretary.id);
    await openForTriageAction(null, form({ complaintId: s.complaint.id }));
    const committee = await committeeId('health-affairs');
    expect(
      await assignToCommitteeAction(null, form({ complaintId: s.complaint.id, committeeId: committee, followUpAt: '2020-01-01' })),
    ).toMatchObject({ ok: false, fieldErrors: { followUpAt: expect.any(Array) } });
    const inWeek = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    expect(
      await assignToCommitteeAction(null, form({ complaintId: s.complaint.id, committeeId: committee, followUpAt: inWeek })),
    ).toMatchObject({ ok: true });
    expect((await db.complaint.findUniqueOrThrow({ where: { id: s.complaint.id } })).followUpAt?.toISOString().slice(0, 10)).toBe(inWeek);
    const assignAudit = await db.auditLog.findFirstOrThrow({ where: { action: 'complaint.assign', entityId: s.complaint.id } });
    expect(assignAudit.after).toMatchObject({ followUpAt: expect.stringContaining(inWeek) });

    const head = await createUser([{ key: 'committee_head', committee: 'health-affairs' }]);
    await actAs(head.id);
    const inMonth = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    await updateStatusAction(null, form({ complaintId: s.complaint.id, toStatus: 'COMMITTEE_REVIEW', followUpAt: inMonth }));
    expect((await db.complaint.findUniqueOrThrow({ where: { id: s.complaint.id } })).followUpAt?.toISOString().slice(0, 10)).toBe(inMonth);
    await updateStatusAction(null, form({ complaintId: s.complaint.id, toStatus: 'IN_PROGRESS' }));
    expect((await db.complaint.findUniqueOrThrow({ where: { id: s.complaint.id } })).followUpAt).not.toBeNull();
    await updateStatusAction(null, form({ complaintId: s.complaint.id, toStatus: 'RESOLVED', note: 'حُلّت المشكلة بالكامل.' }));
    expect((await db.complaint.findUniqueOrThrow({ where: { id: s.complaint.id } })).followUpAt).toBeNull();
  });
});
