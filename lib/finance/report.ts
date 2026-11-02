import { CURRENCIES } from '@/lib/config';
import { fromCents, toCents, type FundingRow } from '@/lib/initiatives/workflow';

// بيانات «التقرير الإداري والمالي» من القيود — حساب خالص بلا قاعدة بيانات.
// ما لا مصدر له في المنصة بعد (الاجتماعات، الأنشطة، المؤشرات، الموازنة) يبقى فارغًا في النموذج.

export type ReportEntry = FundingRow & {
  occurredAt: Date;
  description: string | null;
  counterparty: string | null;
  category: string | null;
  documentNumber: string | null;
  organization: { name: string } | null;
  initiative: { title: string } | null;
  approvedBy: { fullName: string } | null;
};

export type ByCurrency = Record<string, string>;

const UNCATEGORIZED = 'غير مصنّف';

function sumByCurrency(rows: FundingRow[]): ByCurrency {
  const out: ByCurrency = {};
  for (const currency of CURRENCIES) {
    const list = rows.filter((r) => r.currency === currency);
    if (list.length) out[currency] = fromCents(list.reduce((acc, r) => acc + toCents(r.amount), 0n));
  }
  return out;
}

/** الوارد − المصروف لكل عملة ظهرت في أيٍّ منهما */
function net(rows: FundingRow[]): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const r of rows) {
    const sign = r.direction === 'INCOMING' ? 1n : -1n;
    out.set(r.currency, (out.get(r.currency) ?? 0n) + sign * toCents(r.amount));
  }
  return out;
}

const toByCurrency = (values: Map<string, bigint>): ByCurrency =>
  Object.fromEntries(CURRENCIES.filter((c) => values.has(c)).map((c) => [c, fromCents(values.get(c)!)]));

/**
 * rows: كل القيود حتى نهاية الفترة (ما قبل بدايتها يكوّن الرصيد الافتتاحي).
 * opening = null حين لا بداية للفترة: لا شيء قبلها يُحسب منه.
 */
export function buildFinancialReport(rows: ReportEntry[], range: { from?: Date; to?: Date }) {
  const before = range.from ? rows.filter((r) => r.occurredAt < range.from!) : [];
  const within = rows
    .filter((r) => (!range.from || r.occurredAt >= range.from) && (!range.to || r.occurredAt <= range.to))
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const incomes = within.filter((r) => r.direction === 'INCOMING');
  const expenses = within.filter((r) => r.direction === 'OUTGOING');

  const closing = net(before);
  for (const [currency, value] of net(within)) closing.set(currency, (closing.get(currency) ?? 0n) + value);

  const names = [...new Set(expenses.map((e) => e.category?.trim() || UNCATEGORIZED))];
  const categories = names.map((name) => ({
    name,
    actual: sumByCurrency(expenses.filter((e) => (e.category?.trim() || UNCATEGORIZED) === name)),
  }));

  return {
    period: { from: range.from ?? within[0]?.occurredAt ?? null, to: range.to ?? within.at(-1)?.occurredAt ?? null },
    opening: range.from ? toByCurrency(net(before)) : null,
    totalIncoming: sumByCurrency(incomes),
    totalOutgoing: sumByCurrency(expenses),
    closing: toByCurrency(closing),
    incomes,
    expenses,
    categories,
  };
}

export type FinancialReport = ReturnType<typeof buildFinancialReport>;
