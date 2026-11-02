import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  buildTrend,
  closureRate,
  formatMetric,
  formatTarget,
  meetsTarget,
  median,
  monthsBetween,
  onTimeRate,
  parseSnapshot,
  ratio,
  trackedRate,
  triageMedian,
  type ComplaintFact,
} from '@/lib/reports/metrics';
import { TrendChart } from '@/components/shared/trend-chart';

// Sprint 5 — حساب M1–M10 على بيانات ثابتة (§17 بند 11)

const at = (iso: string) => new Date(iso);
const fact = (created: string, assignedAfterHours: number | null, closed = false, tracked = false): ComplaintFact => ({
  createdAt: at(created),
  assignedAt: assignedAfterHours === null ? null : new Date(at(created).getTime() + assignedAfterHours * 3_600_000),
  closed,
  tracked,
});

describe('median · ratio', () => {
  it('وسيط عدد فردي وزوجي وقائمة فارغة', () => {
    expect(median([30, 10, 20])).toBe(20);
    expect(median([40, 10, 20, 30])).toBe(25);
    expect(median([])).toBeNull();
  });

  it('المقام الصفري يعطي null لا صفرًا مضللًا', () => {
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(3, 4)).toBe(0.75);
  });
});

describe('M3 · M4 · M5', () => {
  const cohort = [
    fact('2026-03-01T08:00:00Z', 10, true, true),
    fact('2026-03-02T08:00:00Z', 50, false, true),
    fact('2026-03-03T08:00:00Z', 20, true, false),
    fact('2026-03-04T08:00:00Z', null, false, false),
  ];

  it('M3 وسيط الساعات للشكاوى المحوّلة فقط', () => {
    expect(triageMedian(cohort)).toBe(20);
    expect(triageMedian([fact('2026-03-04T08:00:00Z', null)])).toBeNull();
  });

  it('M4 و M5 نسبتان على كل شكاوى الفترة', () => {
    expect(closureRate(cohort)).toBe(0.5);
    expect(trackedRate(cohort)).toBe(0.5);
    expect(closureRate([])).toBeNull();
  });
});

describe('M7 — المهام المعتمدة قبل موعدها', () => {
  const due = at('2026-03-10T12:00:00Z');
  it('المنجزة في موعدها تُحسب، والمتأخرة وغير المنجزة لا', () => {
    expect(
      onTimeRate([
        { dueAt: due, approvedAt: at('2026-03-10T12:00:00Z'), done: true },
        { dueAt: due, approvedAt: at('2026-03-11T00:00:00Z'), done: true },
        { dueAt: due, approvedAt: null, done: false },
        { dueAt: due, approvedAt: at('2026-03-09T00:00:00Z'), done: true },
      ]),
    ).toBe(0.5);
    expect(onTimeRate([])).toBeNull();
  });
});

describe('الفترات والاتجاه الشهري', () => {
  it('الأشهر شاملة للطرفين وتعبر رأس السنة', () => {
    expect(monthsBetween('2025-11-15', '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthsBetween('2026-03-01', '2026-03-31')).toEqual(['2026-03']);
  });

  it('الشهر بتوقيت غزة: 23:30 UTC آخر يوم في الشهر = الشهر التالي', () => {
    const trend = buildTrend('2026-01-01', '2026-02-28', [fact('2026-01-31T23:30:00Z', null)]);
    expect(trend.map((p) => [p.month, p.complaints])).toEqual([
      ['2026-01', 0],
      ['2026-02', 1],
    ]);
  });

  it('شهر بلا شكاوى: عدد صفر ووسيط ونسبة null', () => {
    const trend = buildTrend('2026-03-01', '2026-04-30', [fact('2026-03-05T08:00:00Z', 5, true)]);
    expect(trend[0]).toEqual({ month: '2026-03', complaints: 1, triageMedianHours: 5, closureRate: 1 });
    expect(trend[1]).toEqual({ month: '2026-04', complaints: 0, triageMedianHours: null, closureRate: null });
  });
});

describe('العرض والأهداف المقترحة', () => {
  it('تنسيق حسب الوحدة', () => {
    expect(formatMetric('M4', 0.604)).toBe('60%');
    expect(formatMetric('M3', 0.4)).toBe('أقل من ساعة');
    expect(formatMetric('M3', 36.6)).toBe('37 ساعة');
    expect(formatMetric('M2', 1200)).toBe('1,200');
    expect(formatMetric('M9', null)).toBeNull();
  });

  it('اتجاه الهدف: M3 أقل من 48 ساعة، M10 صفر، البقية حد أدنى', () => {
    expect(meetsTarget('M3', 47)).toBe(true);
    expect(meetsTarget('M3', 49)).toBe(false);
    expect(meetsTarget('M10', 0)).toBe(true);
    expect(meetsTarget('M10', 1)).toBe(false);
    expect(meetsTarget('M1', 300)).toBe(true);
    expect(meetsTarget('M1', null)).toBeNull();
    expect(formatTarget('M3')).toBe('أقل من 48 ساعة');
    expect(formatTarget('M10')).toBe('صفر');
  });
});

describe('parseSnapshot', () => {
  it('يرفض الشكل المجهول ويُسقط القيم غير الرقمية', () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot({ version: 2 })).toBeNull();
    const s = parseSnapshot({
      version: 1,
      from: '2026-01-01',
      to: '2026-01-31',
      scope: 'ALL',
      generatedAt: '2026-02-01T00:00:00Z',
      values: { M1: 5, M2: 'x', M3: Number.NaN },
      trend: [],
    });
    expect(s?.values.M1).toBe(5);
    expect(s?.values.M2).toBeNull();
    expect(s?.values.M3).toBeNull();
    expect(s?.values.M10).toBeNull();
  });
});

describe('TrendChart — §12', () => {
  const render = (series: Record<string, string | number | null>[]) =>
    renderToStaticMarkup(createElement(TrendChart, { series, xKey: 'm', yKey: 'v', ariaLabel: 'اختبار' }));

  it('أقل من نقطتين قابلتين للرسم ⇒ رسالة لا رسم', () => {
    for (const series of [[], [{ m: '2026-01', v: 3 }], [{ m: '2026-01', v: 3 }, { m: '2026-02', v: null }]]) {
      const html = render(series);
      expect(html).toContain('نقطتين على الأقل');
      expect(html).not.toContain('<svg');
      expect(html).not.toContain('role="img"');
    }
  });

  it('نقطتان فأكثر ⇒ رسم مع جدول بديل لقارئ الشاشة', () => {
    const html = render([
      { m: '2026-01', v: 3 },
      { m: '2026-02', v: 5 },
    ]);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="اختبار"');
    expect(html).toContain('<caption>اختبار</caption>');
    expect(html).toContain('2026-02');
  });
});
