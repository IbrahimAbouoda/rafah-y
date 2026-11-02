import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { CURRENCIES } from '@/lib/config';
import type { Amounts } from '@/lib/finance/public';
import { publicFinance } from '@/lib/finance/queries';
import { formatMoney } from '@/lib/initiatives/workflow';
import { can } from '@/lib/rbac';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'الشفافية المالية' };
export const dynamic = 'force-dynamic';

const CURRENCY_LABELS = { ILS: '₪ شيكل', USD: '$ دولار' } as const;

const amountsLine = (amounts: Amounts) =>
  CURRENCIES.filter((c) => amounts[c] !== undefined)
    .map((c) => formatMoney(amounts[c]!, c))
    .join(' + ');

function AmountsList({ rows }: { rows: { name: string; amounts: Amounts }[] }) {
  return (
    <ul className="flex flex-col divide-y text-sm">
      {rows.map((row) => (
        <li key={row.name} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span>{row.name}</span>
          <span className="font-medium">{amountsLine(row.amounts)}</span>
        </li>
      ))}
    </ul>
  );
}

// /transparency/finance — عام (D51). القيود المعتمدة فقط، بالمجاميع وأسماء المؤسسات؛ لا أسماء أفراد ولا قيود مفردة.
// التفاصيل تبقى في /admin/finance (finance:read) و /admin/reports?view=financial (reports:read + finance:read)، والخادم يفحصهما هناك.
export default async function TransparencyFinancePage() {
  const [finance, user] = await Promise.all([publicFinance(), getCurrentUser()]);
  const canReadLedger = user ? can(user, 'finance:read') : false;
  const canReadReports = user ? can(user, 'reports:read') && canReadLedger : false;
  const others = amountsLine(finance.others);

  return (
    <>
      <PageHeader title="الشفافية المالية" description="ما دخل صندوق المجلس وما خرج منه. الأرقام من القيود التي اعتمدها رئيس المجلس فقط، ولكل عملة على حدة.">
        {canReadLedger || canReadReports ? (
          <div className="flex flex-wrap gap-2">
            {canReadLedger ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/finance">السجل المالي</Link>
              </Button>
            ) : null}
            {canReadReports ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/reports?view=financial">التقرير الإداري والمالي</Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </PageHeader>

      {!finance.hasData ? (
        <Card>
          <EmptyState title="لا قيود معتمدة بعد" hint="تظهر الأرقام هنا بعد أن يعتمد رئيس المجلس القيود. تابع مبادرات الشباب حتى ذلك الحين.">
            <Button asChild variant="outline" size="sm">
              <Link href="/initiatives">المبادرات</Link>
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {CURRENCIES.flatMap((c) => {
              const t = finance.totals[c];
              return [
                { key: 'in', label: 'إجمالي الوارد', value: t.incoming, tone: 'text-success' },
                { key: 'out', label: 'إجمالي المصروفات', value: t.outgoing, tone: '' },
                { key: 'left', label: 'المتبقي في الصندوق', value: t.remaining, tone: Number(t.remaining) < 0 ? 'text-danger' : 'text-brand' },
              ].map((card) => (
                <Card key={`${c}-${card.key}`} className="flex flex-col gap-1 p-4">
                  <p className="text-sm text-muted-foreground">
                    {card.label} ({CURRENCY_LABELS[c]})
                  </p>
                  <p className={`text-lg font-semibold ${card.tone}`}>{formatMoney(card.value, c)}</p>
                </Card>
              ));
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>مصادر الوارد</CardTitle>
              </CardHeader>
              <CardContent>
                {finance.organizations.length > 0 || others ? (
                  <>
                    <AmountsList rows={finance.organizations} />
                    {others ? (
                      <p className="flex flex-wrap items-center justify-between gap-2 border-t py-2 text-sm">
                        <span className="text-muted-foreground">مساهمات أفراد وجهات أخرى</span>
                        <span className="font-medium">{others}</span>
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">لا وارد معتمد بعد.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>أوجه الصرف</CardTitle>
              </CardHeader>
              <CardContent>
                {finance.categories.length > 0 ? (
                  <AmountsList rows={finance.categories} />
                ) : (
                  <p className="text-sm text-muted-foreground">لا مصروفات معتمدة بعد.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
