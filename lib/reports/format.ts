// تنسيق قيم الاتجاه الشهري — مشترك بين TrendChart (عميل) و PDF التقرير (خادم).

export type TrendUnit = 'count' | 'hours' | 'ratio';

const num = new Intl.NumberFormat('ar-PS-u-nu-latn');

export function formatTrendValue(v: number | null | undefined, unit: TrendUnit): string {
  if (v === null || v === undefined) return 'لا بيانات';
  if (unit === 'ratio') return `${Math.round(v * 100)}%`;
  if (unit === 'hours') return `${num.format(Math.round(v))} ساعة`;
  return num.format(v);
}
