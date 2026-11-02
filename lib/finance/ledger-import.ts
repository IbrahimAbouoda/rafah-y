import type { Prisma } from '@/lib/generated/prisma/client';
import { CURRENCIES } from '@/lib/config';
import { fromCents, toCents } from '@/lib/initiatives/workflow';

// إدخال سجل مكتوب (مثل 2026.md) في funding_records — يستعمله scripts/import-ledger.ts.
// كل قيد يدخل معلّقًا مهما كانت حالته في الملف: الاعتماد قرار بشري من /admin/finance (funding_four_eyes).

export type LedgerEntry = {
  n: number;
  direction: 'INCOMING' | 'OUTGOING';
  occurredAt: Date;
  /** المصدر في الوارد، والمستفيد في المصروف؛ null حين يكون «-» في الملف */
  party: string | null;
  description: string | null;
  amount: string;
  currency: (typeof CURRENCIES)[number];
};

type ByCurrency = Record<(typeof CURRENCIES)[number], string>;

export type ParsedLedger = {
  entries: LedgerEntry[];
  stated: { incoming: ByCurrency; outgoing: ByCurrency };
  computed: { incoming: ByCurrency; outgoing: ByCurrency };
  /** وصف كل مجموع مكتوب في الملف لا يطابق مجموع بنوده */
  mismatches: string[];
};

const cell = (value: string) => {
  const text = value.trim();
  return text === '' || text === '-' ? null : text;
};

function section(markdown: string, heading: string, next: string): string {
  const start = markdown.indexOf(heading);
  if (start < 0) throw new Error(`لم أجد القسم «${heading}» في الملف.`);
  const end = markdown.indexOf(next, start);
  return end < 0 ? markdown.slice(start) : markdown.slice(start, end);
}

function statedTotals(text: string, what: string): ByCurrency {
  const read = (currency: string) => {
    const match = text.match(new RegExp(`\\(${currency}\\):\\*\\*\\s*\`([\\d,.]+)`));
    if (!match) throw new Error(`لم أجد ${what} بعملة ${currency} في ملخص الملف.`);
    return fromCents(toCents(match[1]!.replace(/,/g, '')));
  };
  return { ILS: read('ILS'), USD: read('USD') };
}

function assertSequential(entries: LedgerEntry[], what: string) {
  entries.forEach((entry, i) => {
    if (entry.n !== i + 1) throw new Error(`ترقيم ${what} غير متسلسل عند الصف ${i + 1} (الملف يقول ${entry.n}): قد يكون صف لم يُقرأ.`);
  });
}

export function parseLedger(markdown: string, now = new Date()): ParsedLedger {
  const incomeText = section(markdown, '## 1.', '## 2.');
  const expenseText = section(markdown, '## 2.', '## 3.');

  const rows = (text: string) => text.split(/\r?\n/).filter((line) => /^\|\s*\d+\s*\|/.test(line)).map((line) => line.split('|').slice(1, -1));
  const amountOf = (value: string, n: number) => {
    const amount = value.trim().replace(/,/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) throw new Error(`المبلغ في الصف ${n} غير صالح: «${value.trim()}».`);
    return amount;
  };
  const dateOf = (value: string, n: number) => {
    const date = new Date(`${value.trim()}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new Error(`التاريخ في الصف ${n} غير صالح: «${value.trim()}».`);
    if (date > now) throw new Error(`التاريخ في الصف ${n} في المستقبل: ${value.trim()}.`);
    return date;
  };
  const currencyOf = (value: string, n: number) => {
    const currency = CURRENCIES.find((c) => value.includes(c));
    if (!currency) throw new Error(`العملة في الصف ${n} غير معروفة: «${value.trim()}».`);
    return currency;
  };

  const incomes = rows(incomeText).map((c): LedgerEntry => {
    const n = Number(c[0]);
    return { n, direction: 'INCOMING', occurredAt: dateOf(c[1]!, n), party: cell(c[2]!), description: cell(c[3]!), amount: amountOf(c[4]!, n), currency: currencyOf(c[5]!, n) };
  });
  const expenses = rows(expenseText).map((c): LedgerEntry => {
    const n = Number(c[0]);
    return { n, direction: 'OUTGOING', occurredAt: dateOf(c[1]!, n), description: cell(c[2]!), party: cell(c[3]!), amount: amountOf(c[4]!, n), currency: currencyOf(c[5]!, n) };
  });
  assertSequential(incomes, 'الوارد');
  assertSequential(expenses, 'المصروفات');

  const total = (list: LedgerEntry[]): ByCurrency => ({
    ILS: fromCents(list.filter((e) => e.currency === 'ILS').reduce((acc, e) => acc + toCents(e.amount), 0n)),
    USD: fromCents(list.filter((e) => e.currency === 'USD').reduce((acc, e) => acc + toCents(e.amount), 0n)),
  });
  const computed = { incoming: total(incomes), outgoing: total(expenses) };
  const stated = { incoming: statedTotals(incomeText, 'إجمالي المقبوضات'), outgoing: statedTotals(expenseText, 'إجمالي المصروفات') };

  const mismatches: string[] = [];
  for (const [label, key] of [['الوارد', 'incoming'], ['المصروفات', 'outgoing']] as const) {
    for (const currency of CURRENCIES) {
      if (stated[key][currency] !== computed[key][currency]) {
        mismatches.push(`${label} ${currency}: الملف يقول ${stated[key][currency]}، ومجموع البنود ${computed[key][currency]}`);
      }
    }
  }
  return { entries: [...incomes, ...expenses], stated, computed, mismatches };
}

export type ImportRow = LedgerEntry & { organizationId: string | null; category: string | null };

type ExistingRow = {
  direction: string;
  occurredAt: Date;
  amount: { toString(): string };
  currency: string;
  description: string | null;
  counterparty: string | null;
  organizationId: string | null;
};

const counterpartyOf = (row: ImportRow) => (row.organizationId ? null : row.party);

const keyOf = (r: Omit<ExistingRow, 'counterparty' | 'organizationId'> & { party: string | null }) =>
  [r.direction, r.occurredAt.toISOString().slice(0, 10), fromCents(toCents(r.amount.toString())), r.currency, r.description ?? '', r.party ?? ''].join('|');

/** إعادة التشغيل آمنة: ما سبق إدخاله لا يتكرر. الصفان المتطابقان يُعدّان، فيُدخل منهما ما نقص فقط. */
export function planLedgerImport(rows: ImportRow[], existing: ExistingRow[], organizationNames: Map<string, string>) {
  const seen = new Map<string, number>();
  for (const row of existing) {
    const party = row.organizationId ? (organizationNames.get(row.organizationId) ?? row.organizationId) : row.counterparty;
    const key = keyOf({ ...row, party });
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const toCreate: ImportRow[] = [];
  const skipped: ImportRow[] = [];
  for (const row of rows) {
    const party = row.organizationId ? (organizationNames.get(row.organizationId) ?? row.organizationId) : row.party;
    const key = keyOf({ ...row, party });
    const left = seen.get(key) ?? 0;
    if (left > 0) {
      seen.set(key, left - 1);
      skipped.push(row);
    } else {
      toCreate.push(row);
    }
  }
  return { toCreate, skipped };
}

/** ما يلزم من المعاملة: يقبل عميل السكربت المجرّد وعميل التطبيق الموسَّع معًا */
type LedgerTx = {
  fundingRecord: { create(args: { data: Prisma.FundingRecordUncheckedCreateInput }): PromiseLike<{ id: string }> };
  auditLog: { create(args: { data: Prisma.AuditLogUncheckedCreateInput }): PromiseLike<unknown> };
};

/** داخل معاملة واحدة مع المستدعي: إما كل القيود بسطور تدقيقها أو لا شيء. */
export async function writeLedgerEntries(tx: LedgerTx, rows: ImportRow[], recorderId: string) {
  for (const row of rows) {
    const record = await tx.fundingRecord.create({
      data: {
        direction: row.direction,
        amount: row.amount,
        currency: row.currency,
        occurredAt: row.occurredAt,
        description: row.description,
        counterparty: counterpartyOf(row),
        category: row.category,
        organizationId: row.organizationId,
        recordedById: recorderId,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: recorderId,
        actorRoles: ['system:ledger-import'],
        action: 'funding.record',
        entityType: 'FundingRecord',
        entityId: record.id,
        after: { ledgerRow: row.n, direction: row.direction, amount: row.amount, currency: row.currency, occurredAt: row.occurredAt.toISOString(), organizationId: row.organizationId },
      },
    });
  }
}
