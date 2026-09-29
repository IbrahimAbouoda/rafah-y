import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { navFor } from '@/lib/nav';
import { collectMetrics, periodBounds, reportScope } from '@/lib/reports/collect';
import { committeeId, createUser, session } from '../support/factories';

// Sprint 5 — لوحة المؤشرات: الأرقام تطابق القاعدة لحظة الطلب (AC-15 ①) وبنطاق reports:read (AC-14).
// القاعدة مشتركة بين الملفات، فكل اختبار يعمل على فترة تاريخية لا يلمسها غيره.

const H = 3_600_000;

async function complaintAt(createdAt: Date, opts: { assignedAfterH?: number; status?: 'RESOLVED' | 'ASSIGNED' | 'SUBMITTED'; tracked?: boolean; committee?: string } = {}) {
  const c = await db.complaint.create({
    data: {
      reference: `RF-CMP-TEST-${randomUUID().slice(0, 8)}`,
      accessCodeHash: 'x',
      title: 'شكوى اختبار المؤشرات',
      body: 'نص شكوى اختبار كافٍ لحساب المؤشرات.',
      status: opts.status ?? 'SUBMITTED',
      createdAt,
      firstTrackedAt: opts.tracked ? new Date(createdAt.getTime() + H) : null,
      committeeId: opts.committee ? await committeeId(opts.committee) : null,
    },
  });
  if (opts.assignedAfterH !== undefined) {
    await db.complaintEvent.createMany({
      data: [
        { complaintId: c.id, toStatus: 'UNDER_REVIEW', createdAt: new Date(createdAt.getTime() + 1000) },
        { complaintId: c.id, toStatus: 'ASSIGNED', createdAt: new Date(createdAt.getTime() + opts.assignedAfterH * H) },
        // تحويل ثانٍ لاحق لا يغيّر الزمن: العبرة بأول تحويل
        { complaintId: c.id, toStatus: 'ASSIGNED', createdAt: new Date(createdAt.getTime() + (opts.assignedAfterH + 100) * H) },
      ],
    });
  }
  return c;
}

describe('collectMetrics — M2 · M3 · M4 · M5 والاتجاه', () => {
  it('الأرقام تطابق السجلات في الفترة ولا تحسب ما خارجها', async () => {
    const period = { from: '2019-03-01', to: '2019-04-30' };
    await complaintAt(new Date('2019-03-05T08:00:00Z'), { assignedAfterH: 10, status: 'RESOLVED', tracked: true });
    await complaintAt(new Date('2019-03-10T08:00:00Z'), { assignedAfterH: 30, status: 'ASSIGNED', tracked: true });
    await complaintAt(new Date('2019-04-02T08:00:00Z'), { assignedAfterH: 20, status: 'RESOLVED' });
    await complaintAt(new Date('2019-04-20T08:00:00Z'));
    await complaintAt(new Date('2019-05-01T08:00:00Z'), { assignedAfterH: 1, status: 'RESOLVED' }); // خارج الفترة
    const youth = await createUser(['youth']);
    await db.idea.create({
      data: {
        reference: `RF-IDA-TEST-${randomUUID().slice(0, 8)}`,
        title: 'فكرة اختبار',
        problem: 'مشكلة اختبار بطول كافٍ للتحقق.',
        solution: 'حل اختبار بطول كافٍ للتحقق.',
        submitterId: youth.id,
        createdAt: new Date('2019-04-10T08:00:00Z'),
      },
    });

    const s = await collectMetrics(period, { all: true });
    expect(s.values.M2).toBe(5);
    expect(s.values.M3).toBe(20);
    expect(s.values.M4).toBe(0.5);
    expect(s.values.M5).toBe(0.5);
    expect(s.values.M9).toBeNull(); // لا أسئلة بوت في الفترة
    expect(s.trend).toEqual([
      { month: '2019-03', complaints: 2, triageMedianHours: 20, closureRate: 0.5 },
      { month: '2019-04', complaints: 2, triageMedianHours: 20, closureRate: 0.5 },
    ]);
  });

  it('اللقطة لا تحمل أي بيانات شخصية: أرقام وتواريخ فقط', async () => {
    const s = await collectMetrics({ from: '2019-03-01', to: '2019-04-30' }, { all: true });
    expect(Object.keys(s).sort()).toEqual(['from', 'generatedAt', 'scope', 'to', 'trend', 'values', 'version']);
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/@|RF-|شكوى|مستخدم/);
  });
});

describe('M7 — انضباط اللجان', () => {
  it('المنجزة قبل موعدها ÷ ما حلّ موعده، والمستقبلية خارج المقام', async () => {
    const cid = await committeeId('health-affairs');
    const head = await createUser([{ key: 'committee_head', committee: 'health-affairs' }]);
    const due = new Date('2018-06-15T12:00:00Z');
    const base = { committeeId: cid, createdById: head.id, title: 'مهمة اختبار', dueAt: due };
    await db.task.createMany({
      data: [
        { ...base, status: 'DONE', approvedAt: new Date('2018-06-14T12:00:00Z') },
        { ...base, status: 'DONE', approvedAt: new Date('2018-06-16T12:00:00Z') },
        { ...base, status: 'IN_PROGRESS' },
      ],
    });
    const s = await collectMetrics({ from: '2018-06-01', to: '2018-06-30' }, { all: true });
    expect(s.values.M7).toBeCloseTo(1 / 3);

    // فترة تمتد للمستقبل: مهمة لم يحلّ موعدها لا تُحسب
    const now = new Date('2018-06-20T00:00:00Z');
    await db.task.create({ data: { ...base, dueAt: new Date('2018-06-25T00:00:00Z') } });
    const early = await collectMetrics({ from: '2018-06-01', to: '2018-06-30' }, { all: true }, now);
    expect(early.values.M7).toBeCloseTo(1 / 3);
  });
});

describe('النطاق — reports:read', () => {
  it('نطاق اللجنة يرى لجانه فقط، والمؤشرات العامة لا تُحسب له', async () => {
    const cid = await committeeId('legal-affairs');
    await complaintAt(new Date('2017-02-03T08:00:00Z'), { committee: 'legal-affairs', status: 'RESOLVED' });
    await complaintAt(new Date('2017-02-04T08:00:00Z'), { committee: 'sports-arts' });
    const period = { from: '2017-02-01', to: '2017-02-28' };
    const scoped = await collectMetrics(period, { all: false, committees: [cid] });
    expect(scoped.scope).toBe('COMMITTEE');
    expect(scoped.values.M2).toBe(1);
    expect(scoped.values.M4).toBe(1);
    expect(scoped.values.M1).toBeNull();
    expect(scoped.values.M8).toBeNull();
    expect(scoped.values.M10).toBeNull();
    const all = await collectMetrics(period, { all: true });
    expect(all.values.M2).toBe(2);
    expect(all.values.M1).toEqual(expect.any(Number));
  });

  it('AC-14: مراقب البلدية يرى اللوحة بنطاق «الكل»، والشاب وعضو اللجنة لا يرونها', async () => {
    const observer = await session((await createUser(['municipality_observer'])).id);
    const youth = await session((await createUser(['youth'])).id);
    const member = await session((await createUser([{ key: 'committee_member', committee: 'health-affairs' }])).id);
    expect(reportScope(observer)).toEqual({ all: true });
    expect(reportScope(youth)).toBeNull();
    expect(reportScope(member)).toBeNull();
    const hrefs = (u: typeof observer) => navFor(u).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs(observer)).toContain('/admin/reports');
    expect(hrefs(member)).not.toContain('/admin/reports');
  });
});

describe('M1 · M8 · M10', () => {
  it('M1 يعدّ الحساب الشبابي النشط فقط، لا المسحوب دوره ولا الموقوف', async () => {
    const before = await collectMetrics({ from: '2016-01-01', to: '2099-12-31' }, { all: true });
    await createUser(['youth']);
    await createUser([{ key: 'youth', revoked: true }]);
    const inactive = await createUser(['youth']);
    await db.user.update({ where: { id: inactive.id }, data: { isActive: false } });
    await createUser(['secretary']);
    const after = await collectMetrics({ from: '2016-01-01', to: '2099-12-31' }, { all: true });
    expect(after.values.M1! - before.values.M1!).toBe(1);
  });

  it('M8 يعدّ المنشور في الفترة فقط', async () => {
    const creator = await createUser(['council_president']);
    const base = { title: 'تقرير اختبار', period: 'MONTHLY' as const, periodStart: new Date('2015-01-01'), periodEnd: new Date('2015-01-31'), metrics: {}, createdById: creator.id };
    await db.report.createMany({
      data: [
        { ...base, isPublished: true, publishedAt: new Date('2015-02-02T10:00:00Z') },
        { ...base, isPublished: false },
        { ...base, isPublished: true, publishedAt: new Date('2015-03-02T10:00:00Z') },
      ],
    });
    const s = await collectMetrics({ from: '2015-02-01', to: '2015-02-28' }, { all: true });
    expect(s.values.M8).toBe(1);
  });

  it('M10 يعدّ السجلات التجريبية ومنها المحذوفة ناعمًا', async () => {
    const period = { from: '2014-01-01', to: '2014-01-31' };
    const before = (await collectMetrics(period, { all: true })).values.M10!;
    const c = await complaintAt(new Date('2014-01-05T08:00:00Z'));
    await db.complaint.update({ where: { id: c.id }, data: { isDemo: true, deletedAt: new Date() } });
    expect((await collectMetrics(period, { all: true })).values.M10).toBe(before + 1);
  });
});

describe('periodBounds', () => {
  it('يرفض الفترة المعكوسة والتاريخ غير الصالح، ويشمل يوم النهاية كاملًا بتوقيت غزة', () => {
    expect(periodBounds({ from: '2026-05-02', to: '2026-05-01' })).toBeNull();
    expect(periodBounds({ from: 'x', to: '2026-05-01' })).toBeNull();
    const b = periodBounds({ from: '2026-05-01', to: '2026-05-01' })!;
    expect(b.lt.getTime() - b.gte.getTime()).toBe(24 * H);
    expect(b.gte.toISOString()).toBe('2026-04-30T21:00:00.000Z'); // +03 صيفًا
  });
});
