import { CURRENCIES } from '@/lib/config';
import { EXPENSE_CATEGORIES, ledgerTotals } from '@/lib/finance/totals';
import { fromCents, toCents, type FundingRow } from '@/lib/initiatives/workflow';

// الشفافية المالية للعامة (/transparency/finance): مجاميع القيود المعتمدة وأسماء المؤسسات فقط.
// الجهة الحرّة (counterparty) والبيان والمُدخل والمعتمِد قد تحمل أسماء أفراد، فلا تدخل هنا أصلًا.

export type PublicFundingRow = FundingRow & {
  category: string | null;
  organization: { name: string } | null;
};

export type Amounts = Record<string, string>;

const OTHER_CATEGORY = 'بنود أخرى';
const KNOWN_CATEGORIES: readonly string[] = EXPENSE_CATEGORIES;

function sum(rows: FundingRow[]): Amounts {
  const out: Amounts = {};
  for (const currency of CURRENCIES) {
    const list = rows.filter((r) => r.currency === currency);
    if (list.length) out[currency] = fromCents(list.reduce((acc, r) => acc + toCents(r.amount), 0n));
  }
  return out;
}

function groupBy<T extends FundingRow>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  return [...groups].map(([name, list]) => ({ name, amounts: sum(list) }));
}

export function buildPublicFinance(rows: PublicFundingRow[]) {
  const approved = rows.filter((r) => r.approvedAt);
  const incoming = approved.filter((r) => r.direction === 'INCOMING');
  const outgoing = approved.filter((r) => r.direction === 'OUTGOING');
  const fromOrganizations = incoming.filter((r) => r.organization);
  const fromOthers = incoming.filter((r) => !r.organization);

  return {
    hasData: approved.length > 0,
    totals: ledgerTotals(approved),
    organizations: groupBy(fromOrganizations, (r) => r.organization!.name).sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    /** أفراد وجهات غير مسجّلة: مجموع واحد بلا أسماء */
    others: sum(fromOthers),
    // البند حقل حرّ قد يُكتب فيه اسم، فلا يُعرض إلا ما طابق البنود المعتمدة
    categories: groupBy(outgoing, (r) => (r.category && KNOWN_CATEGORIES.includes(r.category.trim()) ? r.category.trim() : OTHER_CATEGORY)),
  };
}
