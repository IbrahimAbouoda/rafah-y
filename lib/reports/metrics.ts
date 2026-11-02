// مؤشرات النجاح M1–M10 — PRD §1.8. هذا الملف منطق خالص بلا قاعدة بيانات (يُختبر وحدةً)،
// والاستعلامات في lib/reports/collect.ts. اللقطة (MetricsSnapshot) هي ما يُحفظ في Report.metrics
// ولا يتغيّر بعد التوليد (AC-15 ②)، فشكلها مُرقَّم بـ version ولا يحمل أي بيانات شخصية.

export const METRIC_KEYS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

type Unit = 'count' | 'hours' | 'ratio';

/**
 * window:
 * - period: ما وقع داخل الفترة [from, to)
 * - cumulative: الرصيد حتى نهاية الفترة
 * - current: الحالة لحظة التوليد (لا معنى للفترة فيها)
 * global: مؤشر على مستوى المنصة، لا يُحسب بنطاق لجنة.
 */
export type MetricDefinition = {
  key: MetricKey;
  label: string;
  definition: string;
  unit: Unit;
  window: 'period' | 'cumulative' | 'current';
  global?: boolean;
  /** الهدف المقترح بعد 3 أشهر من الإطلاق — «مقترح» حتى إقرار Q10 */
  target: { value: number; direction: 'min' | 'max' };
  /** سبب غياب القيمة إن لم تكن قابلة للحساب بعد */
  pending?: string;
};

export const METRICS: Record<MetricKey, MetricDefinition> = {
  M1: {
    key: 'M1',
    label: 'تبنّي الشباب',
    definition: 'الحسابات الشبابية المفعّلة حتى نهاية الفترة',
    unit: 'count',
    window: 'cumulative',
    global: true,
    target: { value: 300, direction: 'min' },
  },
  M2: {
    key: 'M2',
    label: 'استخدام حقيقي',
    definition: 'الشكاوى والأفكار المقدّمة خلال الفترة',
    unit: 'count',
    window: 'period',
    target: { value: 120, direction: 'min' },
  },
  M3: {
    key: 'M3',
    label: 'سرعة الفرز',
    definition: 'وسيط الزمن من التقديم إلى التحويل للجنة، لشكاوى الفترة التي حُوّلت',
    unit: 'hours',
    window: 'period',
    target: { value: 48, direction: 'max' },
  },
  M4: {
    key: 'M4',
    label: 'نسبة الإغلاق',
    definition: 'شكاوى الفترة التي بلغت «تم الحل» أو «مغلقة» ÷ شكاوى الفترة',
    unit: 'ratio',
    window: 'period',
    target: { value: 0.6, direction: 'min' },
  },
  M5: {
    key: 'M5',
    label: 'متابعة الشاب لنفسه',
    definition: 'شكاوى الفترة التي فُتحت صفحة تتبّعها مرة على الأقل ÷ شكاوى الفترة',
    unit: 'ratio',
    window: 'period',
    target: { value: 0.7, direction: 'min' },
  },
  M6: {
    key: 'M6',
    label: 'تحويل الاحتياج إلى دعم',
    definition: 'عروض الدعم التي قُبلت خلال الفترة',
    unit: 'count',
    window: 'period',
    target: { value: 8, direction: 'min' },
  },
  M7: {
    key: 'M7',
    label: 'انضباط اللجان',
    definition: 'المهام المعتمدة منجزةً قبل موعدها ÷ المهام التي حلّ موعدها خلال الفترة',
    unit: 'ratio',
    window: 'period',
    target: { value: 0.65, direction: 'min' },
  },
  M8: {
    key: 'M8',
    label: 'الشفافية',
    definition: 'التقارير المنشورة للعامة خلال الفترة',
    unit: 'count',
    window: 'period',
    global: true,
    target: { value: 3, direction: 'min' },
  },
  M9: {
    key: 'M9',
    label: 'الاكتفاء الذاتي بالأسئلة',
    definition: 'أسئلة البوت التي وجدت إجابة معتمدة (ولم يقل صاحبها إنها لم تفده) ÷ كل أسئلة البوت في الفترة',
    unit: 'ratio',
    window: 'period',
    global: true,
    target: { value: 0.6, direction: 'min' },
  },
  M10: {
    key: 'M10',
    label: 'نظافة البيانات',
    definition: 'سجلات تجريبية (isDemo) في قاعدة البيانات الآن',
    unit: 'count',
    window: 'current',
    global: true,
    target: { value: 0, direction: 'max' },
  },
};

export type TrendPoint = {
  /** YYYY-MM بتوقيت غزة */
  month: string;
  complaints: number;
  /** M3 لشكاوى الشهر — null إن لم تُحوَّل أي شكوى */
  triageMedianHours: number | null;
  /** M4 لشكاوى الشهر — null إن لم تُقدَّم أي شكوى */
  closureRate: number | null;
};

export type MetricsSnapshot = {
  version: 1;
  /** YYYY-MM-DD شاملة للطرفين، بتوقيت غزة */
  from: string;
  to: string;
  scope: 'ALL' | 'COMMITTEE';
  generatedAt: string;
  values: Record<MetricKey, number | null>;
  trend: TrendPoint[];
};

// ─── حساب خالص ────────────────────────────────────────────────

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** نسبة بمقام صفري = null («لا بيانات بعد») لا صفر مضلل (StatTile §12) */
export function ratio(part: number, total: number): number | null {
  return total > 0 ? part / total : null;
}

const HOUR = 60 * 60 * 1000;
export const hoursBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / HOUR;

const monthFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza', year: 'numeric', month: '2-digit' });
/** مفتاح الشهر YYYY-MM بتوقيت غزة */
export const monthKey = (d: Date) => monthFormatter.format(d).slice(0, 7);

/** الأشهر من شهر from إلى شهر to شاملة — مفاتيح YYYY-MM من نصوص YYYY-MM-DD */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const end = to.slice(0, 7);
  for (let guard = 0; guard < 600; guard++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key > end) break;
    out.push(key);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export type ComplaintFact = {
  createdAt: Date;
  /** أول انتقال إلى ASSIGNED — null إن لم تُحوَّل */
  assignedAt: Date | null;
  closed: boolean;
  tracked: boolean;
};

export type TaskFact = { dueAt: Date; approvedAt: Date | null; done: boolean };

export function triageMedian(complaints: readonly ComplaintFact[]): number | null {
  return median(complaints.flatMap((c) => (c.assignedAt ? [hoursBetween(c.createdAt, c.assignedAt)] : [])));
}

export const closureRate = (complaints: readonly ComplaintFact[]) =>
  ratio(complaints.filter((c) => c.closed).length, complaints.length);

export const trackedRate = (complaints: readonly ComplaintFact[]) =>
  ratio(complaints.filter((c) => c.tracked).length, complaints.length);

/** M7: مهمة منجزة ومعتمدة في موعدها أو قبله. المهام التي لم يحلّ موعدها لا تدخل المقام. */
export const onTimeRate = (tasks: readonly TaskFact[]) =>
  ratio(tasks.filter((t) => t.done && t.approvedAt && t.approvedAt <= t.dueAt).length, tasks.length);

export function buildTrend(from: string, to: string, complaints: readonly ComplaintFact[]): TrendPoint[] {
  const byMonth = new Map<string, ComplaintFact[]>();
  for (const c of complaints) {
    const k = monthKey(c.createdAt);
    const list = byMonth.get(k);
    if (list) list.push(c);
    else byMonth.set(k, [c]);
  }
  return monthsBetween(from, to).map((month) => {
    const list = byMonth.get(month) ?? [];
    return {
      month,
      complaints: list.length,
      triageMedianHours: triageMedian(list),
      closureRate: closureRate(list),
    };
  });
}

// ─── عرض ──────────────────────────────────────────────────────

const intFormat = new Intl.NumberFormat('ar-PS-u-nu-latn');

export function formatMetric(key: MetricKey, value: number | null): string | null {
  if (value === null) return null;
  const { unit } = METRICS[key];
  if (unit === 'ratio') return `${Math.round(value * 100)}%`;
  if (unit === 'hours') return value < 1 ? 'أقل من ساعة' : `${intFormat.format(Math.round(value))} ساعة`;
  return intFormat.format(value);
}

export function formatTarget(key: MetricKey): string {
  const { unit, target } = METRICS[key];
  const v =
    unit === 'ratio' ? `${Math.round(target.value * 100)}%` : unit === 'hours' ? `${target.value} ساعة` : `${target.value}`;
  return target.direction === 'max' ? (target.value === 0 ? 'صفر' : `أقل من ${v}`) : v;
}

/** هل بلغ المؤشر هدفه المقترح؟ null = لا قيمة */
export function meetsTarget(key: MetricKey, value: number | null): boolean | null {
  if (value === null) return null;
  const { target } = METRICS[key];
  return target.direction === 'min' ? value >= target.value : value <= target.value;
}

/** يقرأ لقطة محفوظة في Report.metrics، ويرفض ما لا يطابق الشكل (لا يُعرض محتوى مجهول). */
export function parseSnapshot(json: unknown): MetricsSnapshot | null {
  if (!json || typeof json !== 'object') return null;
  const s = json as Partial<MetricsSnapshot>;
  if (s.version !== 1 || typeof s.from !== 'string' || typeof s.to !== 'string') return null;
  if (!s.values || typeof s.values !== 'object' || !Array.isArray(s.trend)) return null;
  const values = {} as Record<MetricKey, number | null>;
  for (const k of METRIC_KEYS) {
    const v = (s.values as Record<string, unknown>)[k];
    values[k] = typeof v === 'number' && Number.isFinite(v) ? v : null;
  }
  return { ...(s as MetricsSnapshot), values };
}
