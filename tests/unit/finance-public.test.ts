import { describe, expect, it } from 'vitest';
import { buildPublicFinance, type PublicFundingRow } from '@/lib/finance/public';

const row = (over: Partial<PublicFundingRow>): PublicFundingRow => ({
  direction: 'OUTGOING',
  amount: '10',
  currency: 'ILS',
  approvedAt: new Date('2026-10-01'),
  category: null,
  organization: null,
  ...over,
});

describe('buildPublicFinance — الشفافية المالية', () => {
  it('المعتمد فقط يدخل في كل الأرقام', () => {
    const result = buildPublicFinance([row({ direction: 'INCOMING', amount: '100' }), row({ direction: 'INCOMING', amount: '999', approvedAt: null }), row({ amount: '999', approvedAt: null })]);
    expect(result.totals.ILS).toMatchObject({ incoming: '100.00', outgoing: '0.00', remaining: '100.00' });
  });

  it('المؤسسات بأسمائها ولكل عملة، وغيرها مجموع واحد بلا أسماء', () => {
    const result = buildPublicFinance([
      row({ direction: 'INCOMING', amount: '6450', currency: 'USD', organization: { name: 'مركز مسار' } }),
      row({ direction: 'INCOMING', amount: '50', organization: { name: 'مركز مسار' } }),
      row({ direction: 'INCOMING', amount: '3040' }),
      row({ direction: 'INCOMING', amount: '1500' }),
    ]);
    expect(result.organizations).toEqual([{ name: 'مركز مسار', amounts: { ILS: '50.00', USD: '6450.00' } }]);
    expect(result.others).toEqual({ ILS: '4540.00' });
  });

  it('البند الحر لا يظهر إلا إن طابق البنود المعتمدة', () => {
    const result = buildPublicFinance([
      row({ amount: '20', category: 'الاتصالات' }),
      row({ amount: '30', category: 'مكافأة فلان الفلاني' }),
      row({ amount: '40' }),
    ]);
    expect(result.categories).toEqual([
      { name: 'الاتصالات', amounts: { ILS: '20.00' } },
      { name: 'بنود أخرى', amounts: { ILS: '70.00' } },
    ]);
    expect(JSON.stringify(result)).not.toContain('فلان');
  });

  it('لا قيود معتمدة ⇒ حالة فارغة', () => {
    expect(buildPublicFinance([row({ approvedAt: null })])).toMatchObject({ hasData: false, organizations: [], others: {}, categories: [] });
  });
});
