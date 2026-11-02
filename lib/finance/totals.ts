import { CURRENCIES } from '@/lib/config';
import { fromCents, toCents, type FundingRow } from '@/lib/initiatives/workflow';

// مجاميع السجل المالي — لكل عملة على حدة (D13: المبالغ لا تُجمع عبر العملات). الحساب بالقروش.

export type CurrencyTotals = {
  /** المعتمد فقط */
  incoming: string;
  outgoing: string;
  /** الوارد المعتمد − المصروف المعتمد */
  remaining: string;
  /** بانتظار الاعتماد: لا يدخل في الوارد ولا المصروف ولا المتبقي */
  pendingIncoming: string;
  pendingOutgoing: string;
};

export type LedgerTotals = Record<(typeof CURRENCIES)[number], CurrencyTotals>;

export function ledgerTotals(rows: FundingRow[]): LedgerTotals {
  const totals = {} as LedgerTotals;
  for (const currency of CURRENCIES) {
    const sum = (direction: FundingRow['direction'], approved: boolean) =>
      rows
        .filter((r) => r.currency === currency && r.direction === direction && Boolean(r.approvedAt) === approved)
        .reduce((acc, r) => acc + toCents(r.amount), 0n);
    const incoming = sum('INCOMING', true);
    const outgoing = sum('OUTGOING', true);
    totals[currency] = {
      incoming: fromCents(incoming),
      outgoing: fromCents(outgoing),
      remaining: fromCents(incoming - outgoing),
      pendingIncoming: fromCents(sum('INCOMING', false)),
      pendingOutgoing: fromCents(sum('OUTGOING', false)),
    };
  }
  return totals;
}

/** بنود المصروف المقترحة في نموذج القيد — الحقل حرّ، وهذه لتوحيد التسمية في التقرير */
export const EXPENSE_CATEGORIES = [
  'الاتصالات',
  'المواصلات والزيارات',
  'الضيافة والوجبات',
  'الطباعة والدعم اللوجستي',
  'المكافآت',
  'التأجير',
  'المصاريف والنفقات التشغيلية',
] as const;
