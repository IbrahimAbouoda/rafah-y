import type { Metadata } from 'next';
import { financialReport } from '@/lib/finance/queries';
import { guardPage } from '@/lib/page-guard';
import { can } from '@/lib/rbac';
import { ReportFilterSchema } from '@/lib/validation/finance';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { FinancialReport } from '@/components/reports/financial-report';
import { PrintButton } from '@/components/reports/print-button';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Label } from '@/components/ui/form-controls';
import { Alert, Card } from '@/components/ui/surface';
import './report.css';

export const metadata: Metadata = { title: 'التقارير' };

// /admin/reports — reports:read، والتقرير المالي يحتاج finance:read أيضًا. التصدير reports:export.
// إنشاء التقارير المحفوظة ونشرها (Report · reports:publish) في Sprint 5؛ هذه معاينة حية للقيود وتصديرها.
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; pending?: string }> }) {
  const { user, allowed, backHref } = await guardPage('/admin/reports', 'reports:read');
  if (!allowed || !can(user, 'finance:read')) return <Forbidden backHref={backHref} />;

  const params = await searchParams;
  const filter = ReportFilterSchema.safeParse(params);
  const range = filter.success ? filter.data : { from: undefined, to: undefined, pending: false };
  const report = await financialReport(user, { from: range.from, to: range.to, includePending: range.pending });
  const hasEntries = report.incomes.length > 0 || report.expenses.length > 0;

  return (
    <>
      <PageHeader title="التقرير الإداري والمالي" description="يُبنى من قيود السجل المالي. الأقسام التي لا مصدر لها في المنصة بعد تبقى فارغة لتُملأ يدويًا بعد الطباعة.">
        {can(user, 'reports:export') ? <PrintButton /> : null}
      </PageHeader>

      <Card className="mb-4 p-4">
        <form action="/admin/reports" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="report-from">من</Label>
            <Input id="report-from" name="from" type="date" defaultValue={params.from} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="report-to">إلى</Label>
            <Input id="report-to" name="to" type="date" defaultValue={params.to} />
          </div>
          <div className="flex h-10 items-center gap-2">
            <Checkbox id="report-pending" name="pending" value="1" defaultChecked={range.pending} />
            <Label htmlFor="report-pending">شمول القيود غير المعتمدة</Label>
          </div>
          <Button type="submit" variant="outline">
            عرض
          </Button>
        </form>
      </Card>

      {!filter.success ? (
        <Alert tone="danger" className="mb-4">
          {filter.error.issues[0]?.message ?? 'الفترة غير صحيحة. صحّح التاريخين.'} يُعرض التقرير الآن لكل الفترات.
        </Alert>
      ) : null}
      {!hasEntries ? (
        <Alert tone="info" className="mb-4">
          لا قيود في هذه الفترة{range.pending ? '' : ' معتمدة'}. يظهر النموذج فارغًا؛ غيّر الفترة أو اشمل القيود غير المعتمدة.
        </Alert>
      ) : null}

      <div className="rp-scroll overflow-x-auto">
        <FinancialReport report={report} preparedOn={new Date()} includePending={range.pending} />
      </div>
    </>
  );
}
