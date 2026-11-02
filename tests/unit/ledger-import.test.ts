import { describe, expect, it } from 'vitest';
import { parseLedger, planLedgerImport, type ImportRow } from '@/lib/finance/ledger-import';

const NOW = new Date('2026-11-02T00:00:00Z');

const ledger = (opts: { statedOut?: string; rows?: string; incomeRows?: string } = {}) => `# سجل

## 1. جدول المقبوضات (الوارد)

| # | التاريخ | المصدر | البيان | المبلغ | العملة | الحالة |
|---|---|---|---|---|---|---|
${opts.incomeRows ?? `| 1 | 2026-09-01 | أنس فحجان | توريد | 3,040 | ILS (₪) | معتمد |
| 2 | 2026-10-01 | مركز مسار | تمويل | 6,450 | USD ($) | معتمد |`}

### ملخص إجمالي الوارد:
- **إجمالي المقبوضات بالشيقل (ILS):** \`3,040 ₪\`
- **إجمالي المقبوضات بالدولار (USD):** \`6,450 $\`

## 2. جدول المصروفات (الخارج)

| # | التاريخ | البيان | المستفيد | المبلغ (₪) | العملة | الحالة |
|---|---|---|---|---|---|---|
${opts.rows ?? `| 1 | 2026-10-01 | مواصلات | أحمد عيسى | 1,000 | ILS | معلق |
| 2 | 2026-10-02 | ضيافة | - | 25.50 | ILS | معلق |`}

### ملخص إجمالي المصروفات:
- **إجمالي المصروفات بالشيقل (ILS):** \`${opts.statedOut ?? '1,025.50'} ₪\`
- **إجمالي المصروفات بالدولار (USD):** \`0 $\`

## 3. الرصيد
`;

describe('parseLedger', () => {
  it('يقرأ الوارد والمصروف بأعمدتهما، و«-» = لا جهة', () => {
    const { entries, mismatches } = parseLedger(ledger(), NOW);
    expect(mismatches).toEqual([]);
    expect(entries).toHaveLength(4);
    expect(entries[1]).toMatchObject({ direction: 'INCOMING', party: 'مركز مسار', description: 'تمويل', amount: '6450', currency: 'USD' });
    expect(entries[2]).toMatchObject({ direction: 'OUTGOING', party: 'أحمد عيسى', description: 'مواصلات', amount: '1000', currency: 'ILS' });
    expect(entries[3]).toMatchObject({ party: null, amount: '25.50' });
    expect(entries[0]!.occurredAt.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('يكشف ملخصًا يخالف مجموع البنود (فرق سجل 2026)', () => {
    const { mismatches, computed } = parseLedger(ledger({ statedOut: '771.50' }), NOW);
    expect(computed.outgoing.ILS).toBe('1025.50');
    expect(mismatches).toEqual(['المصروفات ILS: الملف يقول 771.50، ومجموع البنود 1025.50']);
  });

  it('يرفض صفًا مفقودًا ومبلغًا غير صالح وتاريخًا في المستقبل وعملة مجهولة', () => {
    expect(() => parseLedger(ledger({ rows: '| 2 | 2026-10-01 | مواصلات | - | 5 | ILS | معلق |' }), NOW)).toThrow(/غير متسلسل/);
    expect(() => parseLedger(ledger({ rows: '| 1 | 2026-10-01 | مواصلات | - | خمسة | ILS | معلق |' }), NOW)).toThrow(/المبلغ/);
    expect(() => parseLedger(ledger({ rows: '| 1 | 2027-01-01 | مواصلات | - | 5 | ILS | معلق |' }), NOW)).toThrow(/المستقبل/);
    expect(() => parseLedger(ledger({ rows: '| 1 | 2026-10-01 | مواصلات | - | 5 | EUR | معلق |' }), NOW)).toThrow(/العملة/);
  });
});

describe('planLedgerImport — إعادة التشغيل آمنة', () => {
  const row = (over: Partial<ImportRow>): ImportRow => ({
    n: 1,
    direction: 'OUTGOING',
    occurredAt: new Date('2026-10-01T00:00:00Z'),
    party: 'أحمد',
    description: 'مواصلات',
    amount: '50',
    currency: 'ILS',
    organizationId: null,
    category: null,
    ...over,
  });
  const stored = (over = {}) => ({
    direction: 'OUTGOING',
    occurredAt: new Date('2026-10-01T00:00:00Z'),
    amount: '50.00',
    currency: 'ILS',
    description: 'مواصلات',
    counterparty: 'أحمد',
    organizationId: null,
    ...over,
  });

  it('الموجود يُتخطى والجديد يُدخل', () => {
    const { toCreate, skipped } = planLedgerImport([row({ n: 1 }), row({ n: 2, amount: '60' })], [stored()], new Map());
    expect(skipped.map((r) => r.n)).toEqual([1]);
    expect(toCreate.map((r) => r.n)).toEqual([2]);
  });

  it('صفان متطابقان فعلًا في الملف: يُدخل منهما ما نقص فقط', () => {
    const { toCreate, skipped } = planLedgerImport([row({ n: 1 }), row({ n: 2 })], [stored()], new Map());
    expect(skipped).toHaveLength(1);
    expect(toCreate).toHaveLength(1);
  });

  it('قيد مرتبط بمؤسسة يطابق صفه بعد الربط', () => {
    const { skipped } = planLedgerImport(
      [row({ direction: 'INCOMING', party: 'مركز مسار', organizationId: 'org-1', amount: '6450', currency: 'USD' })],
      [stored({ direction: 'INCOMING', amount: '6450', currency: 'USD', counterparty: null, organizationId: 'org-1' })],
      new Map([['org-1', 'مؤسسة مسار الشبابية']]),
    );
    expect(skipped).toHaveLength(1);
  });
});
