import { describe, expect, it } from 'vitest';
import { buildFinancialReport, type ReportEntry } from '@/lib/finance/report';
import { ledgerTotals } from '@/lib/finance/totals';

const entry = (over: Partial<ReportEntry>): ReportEntry => ({
  direction: 'OUTGOING',
  amount: '10',
  currency: 'ILS',
  approvedAt: new Date('2026-10-01'),
  occurredAt: new Date('2026-10-01'),
  description: null,
  counterparty: null,
  category: null,
  documentNumber: null,
  organization: null,
  initiative: null,
  approvedBy: null,
  ...over,
});

describe('ledgerTotals — البطاقات الست', () => {
  it('لكل عملة وارد ومصروف ومتبقٍ، والمعلّق منفصل عنها', () => {
    const totals = ledgerTotals([
      entry({ direction: 'INCOMING', amount: '6038' }),
      entry({ direction: 'INCOMING', amount: '6450', currency: 'USD' }),
      entry({ amount: '3666.50' }),
      entry({ amount: '100', approvedAt: null }),
      entry({ direction: 'INCOMING', amount: '7', currency: 'USD', approvedAt: null }),
    ]);
    expect(totals.ILS).toEqual({ incoming: '6038.00', outgoing: '3666.50', remaining: '2371.50', pendingIncoming: '0.00', pendingOutgoing: '100.00' });
    expect(totals.USD).toEqual({ incoming: '6450.00', outgoing: '0.00', remaining: '6450.00', pendingIncoming: '7.00', pendingOutgoing: '0.00' });
  });

  it('المتبقي قد يكون سالبًا، ولا سجل = أصفار', () => {
    expect(ledgerTotals([entry({ amount: '5' })]).ILS.remaining).toBe('-5.00');
    expect(ledgerTotals([]).USD.remaining).toBe('0.00');
  });
});

describe('buildFinancialReport — التقرير الإداري والمالي', () => {
  const rows = [
    entry({ direction: 'INCOMING', amount: '1000', occurredAt: new Date('2026-08-01') }),
    entry({ amount: '100', occurredAt: new Date('2026-08-15'), category: 'الضيافة والوجبات' }),
    entry({ direction: 'INCOMING', amount: '500', occurredAt: new Date('2026-09-05') }),
    entry({ direction: 'INCOMING', amount: '50', currency: 'USD', occurredAt: new Date('2026-09-06') }),
    entry({ amount: '30', occurredAt: new Date('2026-09-10'), category: 'المكافآت' }),
    entry({ amount: '20', occurredAt: new Date('2026-09-11'), category: 'المكافآت' }),
    entry({ amount: '5', occurredAt: new Date('2026-09-12') }),
  ];

  it('الرصيد الافتتاحي مما قبل الفترة، والختامي = افتتاحي + إيرادات − مصروفات لكل عملة', () => {
    const report = buildFinancialReport(rows, { from: new Date('2026-09-01'), to: new Date('2026-09-30') });
    expect(report.opening).toEqual({ ILS: '900.00' });
    expect(report.totalIncoming).toEqual({ ILS: '500.00', USD: '50.00' });
    expect(report.totalOutgoing).toEqual({ ILS: '55.00' });
    expect(report.closing).toEqual({ ILS: '1345.00', USD: '50.00' });
  });

  it('بلا بداية للفترة: الافتتاحي فارغ، والفترة من أول قيد إلى آخره', () => {
    const report = buildFinancialReport(rows, {});
    expect(report.opening).toBeNull();
    expect(report.period.from).toEqual(new Date('2026-08-01'));
    expect(report.period.to).toEqual(new Date('2026-09-12'));
    expect(report.closing).toEqual({ ILS: '1345.00', USD: '50.00' });
  });

  it('المصروفات تُجمع ببندها، وما بلا بند يظهر «غير مصنّف»', () => {
    const report = buildFinancialReport(rows, { from: new Date('2026-09-01') });
    expect(report.categories).toEqual([
      { name: 'المكافآت', actual: { ILS: '50.00' } },
      { name: 'غير مصنّف', actual: { ILS: '5.00' } },
    ]);
  });

  it('لا قيود: كل شيء فارغ بلا خطأ', () => {
    const report = buildFinancialReport([], {});
    expect(report).toMatchObject({ opening: null, totalIncoming: {}, totalOutgoing: {}, closing: {}, categories: [] });
    expect(report.period).toEqual({ from: null, to: null });
  });
});
