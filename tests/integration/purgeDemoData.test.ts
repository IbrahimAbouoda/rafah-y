import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { DEMO_ACCOUNT_EMAIL } from '@/lib/config';
import { countDemoData, demoSnapshot, demoTotal, runDemoPurge } from '@/lib/demo-data';
import { DEMO_PURGE_CONFIRMATION } from '@/lib/validation/settings';
import { purgeDemoDataAction } from '@/server/actions/system';
import { checkDemoGate, DEMO_COUNT_SQL } from '@/scripts/check-demo-gate.js';
import { actAs, committeeId, createUser, form, session } from '../support/factories';

// Sprint 6 — AC-20: أمر حذف بيانات العرض يحذف الكيانات الستة الحاملة للعلامة وما لا يوجد إلا بها،
// ولا يمس أي سجل حقيقي، ولا يعمل إلا بـ settings:manage وتأكيد صريح، ويكتب settings.change.

const tag = () => randomUUID().slice(0, 8);
const confirmed = () => form({ confirm: DEMO_PURGE_CONFIRMATION });
const purgeAudits = () => db.auditLog.count({ where: { entityType: 'DemoData', entityId: 'purge' } });
const countOnPglite = async () => db.$queryRawUnsafe<{ table: string; count: number }[]>(DEMO_COUNT_SQL);

/** بيانات عرض على النماذج الستة (منها محذوف ناعمًا) + سجلات حقيقية مرتبطة بها وأخرى مستقلة */
async function seedWorld() {
  const creator = await createUser();
  // حساب العرض كما تنشئه البذرة (prisma/seed.ts): معطّل، صاحب أفكار العرض
  const demoAccount = await db.user.upsert({
    where: { email: DEMO_ACCOUNT_EMAIL },
    create: { email: DEMO_ACCOUNT_EMAIL, fullName: 'حساب عرض تجريبي', authId: randomUUID(), isActive: false },
    update: {},
  });
  const youth = await createUser(['youth']);
  const cid = await committeeId('activities-initiatives');
  const org = (isDemo: boolean) =>
    db.organization.create({ data: { name: `مؤسسة ${tag()}`, type: 'LOCAL_NGO', sectors: [], stage: 'CONTACTED', isDemo } });
  const complaint = (isDemo: boolean, deletedAt: Date | null = null) =>
    db.complaint.create({
      data: { reference: `RF-CMP-TEST-${tag()}`, accessCodeHash: 'x', title: 'شكوى', body: 'نص شكوى اختبار كافٍ.', isDemo, deletedAt },
    });
  const initiative = (isDemo: boolean) =>
    db.initiative.create({
      data: {
        slug: `test-${tag()}`,
        title: 'مبادرة',
        summary: 'ملخص مبادرة اختبار.',
        createdById: creator.id,
        isDemo,
        needs: { create: [{ type: 'VENUE', description: 'قاعة', sortOrder: 1 }] },
      },
    });

  const demoOrg = await org(true);
  const demoComplaint = await complaint(true);
  await complaint(true, new Date()); // المحذوف ناعمًا بيانات عرض أيضًا
  const demoInitiative = await initiative(true);
  const demoIdea = await db.idea.create({
    data: {
      reference: `RF-IDA-TEST-${tag()}`,
      title: 'فكرة عرض',
      problem: 'مشكلة بطول كافٍ.',
      solution: 'حل بطول كافٍ.',
      submitterId: demoAccount.id,
      isDemo: true,
    },
  });
  const demoOpp = await db.opportunity.create({
    data: {
      title: 'فرصة عرض',
      description: 'وصف فرصة عرض بطول كافٍ.',
      type: 'TRAINING',
      applyMode: 'INTERNAL',
      createdById: creator.id,
      organizationId: demoOrg.id,
      isDemo: true,
    },
  });
  const demoActivity = await db.activity.create({
    data: { title: 'نشاط عرض', description: 'وصف نشاط.', kind: 'WORKSHOP', committeeId: cid, startsAt: new Date(), createdById: creator.id, isDemo: true },
  });

  const realOrg = await org(false);
  const realComplaint = await complaint(false);
  const realInitiative = await initiative(false);
  // سجلات حقيقية تتعلق بسجلات العرض:
  await db.supportOffer.create({
    data: { initiativeId: demoInitiative.id, organizationId: realOrg.id, submittedById: creator.id, types: ['VENUE'] },
  });
  await db.supportOffer.create({
    data: { initiativeId: realInitiative.id, organizationId: demoOrg.id, submittedById: creator.id, types: ['VENUE'] },
  });
  await db.opportunityApplication.create({ data: { opportunityId: demoOpp.id, applicantId: youth.id } });
  await db.activityRegistration.create({ data: { activityId: demoActivity.id, userId: youth.id } });
  const linkedTask = await db.task.create({
    data: { title: 'مهمة مرتبطة بشكوى عرض', committeeId: cid, createdById: creator.id, complaintId: demoComplaint.id },
  });
  const realIdea = await db.idea.create({
    data: {
      reference: `RF-IDA-TEST-${tag()}`,
      title: 'فكرة حقيقية',
      problem: 'مشكلة بطول كافٍ.',
      solution: 'حل بطول كافٍ.',
      submitterId: youth.id,
      initiativeId: demoInitiative.id,
    },
  });

  return { demoAccount, demoIdea, realOrg, realComplaint, realInitiative, linkedTask, realIdea, youth };
}

describe('purgeDemoDataAction — الرفض', () => {
  it('بلا دخول، أو بلا settings:manage (ولو رئيس المجلس): رفض ولا يُحذف شيء ولا يُكتب تدقيق', async () => {
    await seedWorld();
    const before = await countDemoData(db);
    const audits = await purgeAudits();

    await actAs(null);
    expect(await purgeDemoDataAction(null, confirmed())).toMatchObject({ ok: false, message: expect.stringMatching(/سجّل الدخول/) });

    for (const roles of [['youth'], ['council_president']] as const) {
      const user = await createUser([...roles]);
      await actAs(user.id);
      expect(await purgeDemoDataAction(null, confirmed())).toMatchObject({ ok: false, message: expect.stringMatching(/لا تملك صلاحية/) });
    }

    expect(await countDemoData(db)).toEqual(before);
    expect(await db.user.count({ where: { email: DEMO_ACCOUNT_EMAIL } })).toBe(1);
    expect(await purgeAudits()).toBe(audits);
  });

  it('المسار المباشر (أمر CLI) يرفض من لا يملك settings:manage', async () => {
    const president = await session((await createUser(['council_president'])).id);
    await expect(runDemoPurge(db, president, { source: 'cli' })).rejects.toThrow(/لا تملك صلاحية/);
  });

  it('حساب العرض مرتبط بسجل حقيقي: تُلغى العملية كلها برسالة عربية ولا يُحذف شيء', async () => {
    const { demoAccount } = await seedWorld();
    const cid = await committeeId('activities-initiatives');
    const realTask = await db.task.create({ data: { title: 'مهمة حقيقية', committeeId: cid, createdById: demoAccount.id } });
    const before = await demoSnapshot(db);

    try {
      const admin = await createUser(['super_admin']);
      await actAs(admin.id);
      const res = await purgeDemoDataAction(null, confirmed());
      expect(res).toMatchObject({ ok: false, message: expect.stringContaining('أُلغي الحذف كله') });
      expect(await demoSnapshot(db)).toEqual(before);
    } finally {
      await db.task.delete({ where: { id: realTask.id } });
    }
  });

  it('بلا عبارة التأكيد الحرفية: رفض بخطأ حقل ولا يُحذف شيء', async () => {
    const admin = await createUser(['super_admin']);
    await actAs(admin.id);
    const before = await countDemoData(db);
    for (const confirm of [undefined, 'نعم', 'احذف البيانات']) {
      const res = await purgeDemoDataAction(null, form({ confirm }));
      expect(res).toMatchObject({ ok: false, fieldErrors: { confirm: [expect.stringContaining(DEMO_PURGE_CONFIRMATION)] } });
    }
    expect(await countDemoData(db)).toEqual(before);
  });
});

describe('purgeDemoDataAction — المسار السعيد', () => {
  it('يحذف الكيانات الستة وما لا يوجد إلا بها، ويترك الحقيقي، ويكتب settings.change، وتمرّ بوابة الإنتاج بعده', async () => {
    const w = await seedWorld();
    const before = await demoSnapshot(db);
    const { demoAccount, ...counts } = before;
    expect(demoTotal(counts)).toBeGreaterThan(0);
    expect(demoAccount).toBe(1);
    const prodEnv = { APP_ENV: 'production', DATABASE_URL: 'postgres://pglite' };
    expect(await checkDemoGate(prodEnv, countOnPglite)).toMatchObject({ ok: false, message: expect.stringMatching(/complaints: \d/) });

    const admin = await createUser(['super_admin']);
    await actAs(admin.id);
    const res = await purgeDemoDataAction(null, confirmed());
    expect(res).toMatchObject({ ok: true, message: expect.stringContaining(`حُذف ${demoTotal(counts) + 1} سجلًا`) });

    // صفر بيانات عرض، ومنها المحذوف ناعمًا
    expect(demoTotal(await countDemoData(db))).toBe(0);
    expect(await db.idea.findFirst({ where: { id: w.demoIdea.id, deletedAt: undefined } })).toBeNull();
    // وحساب العرض حُذف فعليًا لا ناعمًا
    expect(await db.user.findFirst({ where: { id: w.demoAccount.id, deletedAt: undefined } })).toBeNull();

    // ما لا يوجد إلا بسجل عرض حُذف معه
    expect(await db.supportOffer.count({ where: { OR: [{ organizationId: w.realOrg.id }, { initiativeId: w.realInitiative.id }] } })).toBe(0);
    expect(await db.opportunityApplication.count({ where: { applicantId: w.youth.id } })).toBe(0);
    expect(await db.activityRegistration.count({ where: { userId: w.youth.id } })).toBe(0);

    // الحقيقي باقٍ، والرابط الاختياري بسجل العرض أُفرغ فقط
    expect(await db.organization.findUnique({ where: { id: w.realOrg.id } })).not.toBeNull();
    expect(await db.complaint.findUnique({ where: { id: w.realComplaint.id } })).not.toBeNull();
    expect(await db.initiative.findUnique({ where: { id: w.realInitiative.id } })).not.toBeNull();
    expect(await db.task.findUniqueOrThrow({ where: { id: w.linkedTask.id } })).toMatchObject({ complaintId: null });
    expect(await db.idea.findUniqueOrThrow({ where: { id: w.realIdea.id } })).toMatchObject({ initiativeId: null });

    const audit = await db.auditLog.findFirstOrThrow({ where: { entityType: 'DemoData', entityId: 'purge' }, orderBy: { id: 'desc' } });
    expect(audit).toMatchObject({ action: 'settings.change', actorId: admin.id, before });
    expect(audit.after).toMatchObject({ deleted: counts, demoAccount: 1, source: 'app' });
    // اختبار الرفض السابق ترك عالمًا تجريبيًا آخر في القاعدة المشتركة، فالعدد حدّ أدنى
    const { dependents } = audit.after as { dependents: Record<string, number> };
    expect(dependents.supportOffers).toBeGreaterThanOrEqual(2);
    expect(dependents.opportunityApplications).toBeGreaterThanOrEqual(1);
    expect(dependents.activityRegistrations).toBeGreaterThanOrEqual(1);

    expect(await checkDemoGate(prodEnv, countOnPglite)).toMatchObject({ ok: true });

    // تشغيل ثانٍ بلا بيانات عرض: لا حذف ولا سطر تدقيق فارغ
    const audits = await purgeAudits();
    expect(await purgeDemoDataAction(null, confirmed())).toMatchObject({ ok: true, message: expect.stringMatching(/لا بيانات تجريبية/) });
    expect(await purgeAudits()).toBe(audits);
  });
});
