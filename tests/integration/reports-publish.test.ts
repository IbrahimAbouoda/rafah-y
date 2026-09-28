import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { generateReportAction, publishReportAction } from '@/server/actions/reports';
import { actAs, createUser, form } from '../support/factories';

// Sprint 5 — المحور ٢: AC-15 (تقرير ونشره) و AC-14 ① (مراقب البلدية لا ينشر).
// فترات تاريخية لا يلمسها غيرها — القاعدة مشتركة بين الملفات.

const PERIOD = { from: '2013-05-01', to: '2013-05-31' };

async function complaintIn2013(status: 'SUBMITTED' | 'RESOLVED' = 'SUBMITTED') {
  return db.complaint.create({
    data: {
      reference: `RF-CMP-TEST-${randomUUID().slice(0, 8)}`,
      accessCodeHash: 'x',
      title: 'شكوى اختبار التقرير',
      body: 'نص شكوى اختبار كافٍ لتقرير الشفافية.',
      status,
      createdAt: new Date('2013-05-10T08:00:00Z'),
    },
  });
}

async function generate(userId: string, extra: Record<string, string> = {}) {
  await actAs(userId);
  return generateReportAction(null, form({ title: 'تقرير أيار', period: 'MONTHLY', ...PERIOD, ...extra }));
}

describe('reports/generate', () => {
  it('يحفظ لقطة الفترة مسودةً غير منشورة، والأرقام تطابق القاعدة لحظة التوليد (AC-15 ①)', async () => {
    await complaintIn2013('RESOLVED');
    await complaintIn2013();
    const secretary = await createUser(['secretary']);
    const res = await generate(secretary.id, { summary: 'ملخص الشهر' });
    expect(res).toMatchObject({ ok: true });
    const report = await db.report.findUniqueOrThrow({ where: { id: res!.data!.id } });
    expect(report).toMatchObject({ isPublished: false, createdById: secretary.id, summaryMd: 'ملخص الشهر', period: 'MONTHLY' });
    expect(report.periodStart.toISOString().slice(0, 10)).toBe('2013-05-01');
    expect(report.periodEnd.toISOString().slice(0, 10)).toBe('2013-05-31');
    const metrics = report.metrics as { scope: string; values: Record<string, number | null> };
    expect(metrics.scope).toBe('ALL');
    expect(metrics.values.M2).toBe(2);
    expect(metrics.values.M4).toBe(0.5);
  });

  it('فترة معكوسة تُرفض برسالة على الحقل', async () => {
    const secretary = await createUser(['secretary']);
    const res = await generate(secretary.id, { from: '2013-06-01', to: '2013-05-01' });
    expect(res).toMatchObject({ ok: false, fieldErrors: { to: expect.any(Array) } });
  });

  it('الشاب وعضو اللجنة بلا reports:read: رفض قبل لمس المدخلات', async () => {
    for (const roles of [['youth'], [{ key: 'committee_member' as const, committee: 'health-affairs' }]] as const) {
      const u = await createUser([...roles]);
      await actAs(u.id);
      const res = await generateReportAction(null, form({}));
      expect(res).toMatchObject({ ok: false, message: expect.stringContaining('لا تملك صلاحية') });
    }
  });
});

describe('reports/publish — AC-15', () => {
  it('الرئيس ينشر: isPublished + سطر report.publish (④)، والنشر الثاني يُرفض', async () => {
    const president = await createUser(['council_president']);
    const { data } = (await generate(president.id))!;
    await actAs(president.id);
    const res = await publishReportAction(null, form({ reportId: data!.id }));
    expect(res).toMatchObject({ ok: true });
    const report = await db.report.findUniqueOrThrow({ where: { id: data!.id } });
    expect(report).toMatchObject({ isPublished: true, publishedById: president.id });
    expect(report.publishedAt).toBeInstanceOf(Date);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'report.publish', entityId: data!.id } });
    expect(audit.actorId).toBe(president.id);

    const again = await publishReportAction(null, form({ reportId: data!.id }));
    expect(again).toMatchObject({ ok: false, message: expect.stringContaining('نُشر') });
    expect(await db.auditLog.count({ where: { action: 'report.publish', entityId: data!.id } })).toBe(1);
  });

  it('② تعديل شكوى بعد النشر لا يغيّر لقطة التقرير المنشور', async () => {
    const c = await complaintIn2013();
    const president = await createUser(['council_president']);
    const { data } = (await generate(president.id))!;
    await actAs(president.id);
    await publishReportAction(null, form({ reportId: data!.id }));
    const before = (await db.report.findUniqueOrThrow({ where: { id: data!.id } })).metrics;

    await db.complaint.update({ where: { id: c.id }, data: { status: 'RESOLVED' } });
    await complaintIn2013('RESOLVED');

    const after = (await db.report.findUniqueOrThrow({ where: { id: data!.id } })).metrics;
    expect(after).toEqual(before);
    // والتقرير الجديد للفترة نفسها يرى التغيير — اللقطة ثابتة لا الأرقام
    const fresh = (await generate(president.id))!;
    const freshMetrics = (await db.report.findUniqueOrThrow({ where: { id: fresh.data!.id } })).metrics as { values: { M2: number } };
    expect(freshMetrics.values.M2).toBe((before as { values: { M2: number } }).values.M2 + 1);
  });

  it('AC-14 ①: مراقب البلدية وأمين السر (بلا reports:publish) يُرفضان، والتقرير يبقى مسودة', async () => {
    const president = await createUser(['council_president']);
    const { data } = (await generate(president.id))!;
    for (const key of ['municipality_observer', 'secretary', 'vice_president'] as const) {
      const u = await createUser([key]);
      await actAs(u.id);
      const res = await publishReportAction(null, form({ reportId: data!.id }));
      expect(res).toMatchObject({ ok: false, message: expect.stringContaining('لا تملك صلاحية') });
    }
    expect((await db.report.findUniqueOrThrow({ where: { id: data!.id } })).isPublished).toBe(false);
  });

  it('لقطة بنطاق لجنة أو تالفة لا تُنشر للعامة', async () => {
    const president = await createUser(['council_president']);
    const base = { title: 'لقطة غير قابلة للنشر', period: 'CUSTOM' as const, periodStart: new Date('2013-05-01'), periodEnd: new Date('2013-05-31'), createdById: president.id };
    const committee = await db.report.create({
      data: { ...base, metrics: { version: 1, from: PERIOD.from, to: PERIOD.to, scope: 'COMMITTEE', generatedAt: new Date().toISOString(), values: {}, trend: [] } },
    });
    const broken = await db.report.create({ data: { ...base, metrics: { hello: 'world' } } });
    await actAs(president.id);
    expect(await publishReportAction(null, form({ reportId: committee.id }))).toMatchObject({ ok: false, message: expect.stringContaining('بنطاق لجنة') });
    expect(await publishReportAction(null, form({ reportId: broken.id }))).toMatchObject({ ok: false, message: expect.stringContaining('تالفة') });
  });

  it('③ التقرير المنشور لا يحمل بيانات شخصية', async () => {
    const president = await createUser(['council_president'], 'رئيس باسم مميز');
    const { data } = (await generate(president.id))!;
    const report = await db.report.findUniqueOrThrow({ where: { id: data!.id } });
    const json = JSON.stringify(report.metrics);
    expect(json).not.toContain('رئيس باسم مميز');
    expect(json).not.toMatch(/@|RF-CMP/);
  });
});
