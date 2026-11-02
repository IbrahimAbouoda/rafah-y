import 'server-only';
import { SIGNUP_ROLE_KEY } from '@/lib/config';
import { db } from '@/lib/db';
import { countDemoData, demoTotal } from '@/lib/demo-data';
import type { Prisma } from '@/lib/generated/prisma/client';
import { scopeFilter, type SessionUser } from '@/lib/rbac';
import { gazaDayStart, toDateInput } from '@/lib/utils';
import {
  buildTrend,
  closureRate,
  METRIC_KEYS,
  METRICS,
  onTimeRate,
  ratio,
  trackedRate,
  triageMedian,
  type ComplaintFact,
  type MetricKey,
  type MetricsSnapshot,
} from './metrics';

// استعلامات المؤشرات — كل رقم يُحسب لحظة الطلب من قاعدة البيانات (AC-15 ①)،
// وبنطاق reports:read للمستخدم: «الكل» يرى الكل، ونطاق اللجنة يرى لجانه، والمؤشرات العامة (global) لا تُحسب له.
// لا يُقرأ هنا أي حقل شخصي: تواريخ وحالات ومعرّفات لجان فقط.

export type ReportScope = { all: true } | { all: false; committees: string[] };

/** نطاق المؤشرات من الصلاحية — null = لا يرى شيئًا (بلا منحة أو منحة «خاص» فقط) */
export function reportScope(user: SessionUser): ReportScope | null {
  const f = scopeFilter(user, 'reports:read');
  if (!f) return null;
  if (f.all) return { all: true };
  return f.committees.length > 0 ? { all: false, committees: f.committees } : null;
}

/** التقارير التي يراها المستخدم: نطاق «الكل» يرى كلها؛ نطاق اللجنة يرى ما ولّده هو فقط (اللقطات الأخرى قد تحمل مؤشرات عامة) */
export function visibleReportsWhere(user: SessionUser, scope: ReportScope): Prisma.ReportWhereInput {
  return scope.all ? {} : { createdById: user.id };
}

export type Period = { from: string; to: string };

const DAY = 24 * 60 * 60 * 1000;

/** [بداية يوم from، بداية اليوم التالي لـ to) بتوقيت غزة — null لمدخل غير صالح أو معكوس */
export function periodBounds(p: Period): { gte: Date; lt: Date } | null {
  const start = gazaDayStart(p.from);
  const endDay = gazaDayStart(p.to);
  if (!start || !endDay || endDay < start) return null;
  return { gte: start, lt: new Date(endDay.getTime() + DAY) };
}

/** الفترة الافتراضية للوحة: آخر 6 أشهر حتى اليوم */
export function defaultPeriod(now = new Date()): Period {
  const to = toDateInput(now);
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - 5, 1);
  return { from: `${toDateInput(d).slice(0, 7)}-01`, to };
}

const CLOSED = new Set(['RESOLVED', 'CLOSED']);

export async function collectMetrics(period: Period, scope: ReportScope, now = new Date()): Promise<MetricsSnapshot> {
  const range = periodBounds(period);
  if (!range) throw new RangeError('invalid period');
  const inCommittees = scope.all ? {} : { committeeId: { in: scope.committees } };
  // المهام التي حلّ موعدها فعلًا — المستقبلية لا تُحسب لها ولا عليها
  const dueRange = { gte: range.gte, lt: range.lt < now ? range.lt : now };

  const [complaints, ideas, offers, tasks, youth, published, demo, bot] = await Promise.all([
    db.complaint.findMany({
      where: { createdAt: range, ...inCommittees },
      select: {
        createdAt: true,
        status: true,
        firstTrackedAt: true,
        events: { where: { toStatus: 'ASSIGNED' }, orderBy: { createdAt: 'asc' }, take: 1, select: { createdAt: true } },
      },
    }),
    db.idea.count({ where: { createdAt: range, ...inCommittees } }),
    db.supportOffer.count({
      where: {
        status: 'ACCEPTED',
        decidedAt: range,
        ...(scope.all ? {} : { initiative: { committeeId: { in: scope.committees } } }),
      },
    }),
    dueRange.lt > dueRange.gte
      ? db.task.findMany({
          where: { dueAt: dueRange, ...inCommittees },
          select: { dueAt: true, approvedAt: true, status: true },
        })
      : [],
    scope.all ? countYouth(range.lt) : null,
    scope.all ? db.report.count({ where: { isPublished: true, publishedAt: range } }) : null,
    scope.all ? countDemo() : null,
    scope.all ? botResolution(range) : null,
  ]);

  const facts: ComplaintFact[] = complaints.map((c) => ({
    createdAt: c.createdAt,
    assignedAt: c.events[0]?.createdAt ?? null,
    closed: CLOSED.has(c.status),
    tracked: c.firstTrackedAt !== null,
  }));

  const values: Record<MetricKey, number | null> = {
    M1: youth,
    M2: complaints.length + ideas,
    M3: triageMedian(facts),
    M4: closureRate(facts),
    M5: trackedRate(facts),
    M6: offers,
    M7: onTimeRate(tasks.map((t) => ({ dueAt: t.dueAt!, approvedAt: t.approvedAt, done: t.status === 'DONE' }))),
    M8: published,
    M9: bot,
    M10: demo,
  };
  for (const k of METRIC_KEYS) if (METRICS[k].pending) values[k] = null;

  return {
    version: 1,
    from: period.from,
    to: period.to,
    scope: scope.all ? 'ALL' : 'COMMITTEE',
    generatedAt: now.toISOString(),
    values,
    trend: buildTrend(period.from, period.to, facts),
  };
}

/** M1: حسابات نشطة تحمل دور التسجيل (من الإعداد، لا مقارنة اسم) بتعيين غير مسحوب أُنشئ قبل نهاية الفترة */
function countYouth(before: Date) {
  const where: Prisma.UserWhereInput = {
    isActive: true,
    createdAt: { lt: before },
    roleAssignments: {
      some: {
        revokedAt: null,
        startsAt: { lt: before },
        OR: [{ endsAt: null }, { endsAt: { gte: before } }],
        role: { key: SIGNUP_ROLE_KEY },
      },
    },
  };
  return db.user.count({ where });
}

/** M9 (قرار 2026-09-28): BotQuery بحالة ANSWERED ÷ كل أسئلة البوت في الفترة — null بلا أسئلة */
async function botResolution(range: { gte: Date; lt: Date }): Promise<number | null> {
  const [total, answered] = await Promise.all([
    db.botQuery.count({ where: { createdAt: range } }),
    db.botQuery.count({ where: { createdAt: range, status: 'ANSWERED' } }),
  ]);
  return ratio(answered, total);
}

/** M10: كل النماذج التي تحمل isDemo، والمحذوف ناعمًا منها أيضًا (السجل ما زال في القاعدة). */
async function countDemo() {
  return demoTotal(await countDemoData(db));
}
