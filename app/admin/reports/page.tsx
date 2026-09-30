import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { guardPage } from '@/lib/page-guard';
import { can, type SessionUser } from '@/lib/rbac';
import { collectMetrics, defaultPeriod, periodBounds, reportScope, visibleReportsWhere, type Period, type ReportScope } from '@/lib/reports/collect';
import { parseSnapshot } from '@/lib/reports/metrics';
import { formatDate, formatDateTime, toDateInput } from '@/lib/utils';
import { PERIOD_LABELS, REPORT_PERIODS } from '@/lib/validation/reports';
import { exportReportAction, generateReportAction, publishReportAction } from '@/server/actions/reports';
import { DownloadButton } from '@/components/shared/download-button';
import { ActionButtons } from '@/components/shared/action-buttons';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { MetricTiles, ReportSummary } from '@/components/shared/report-snapshot';
import { TrendCharts } from '@/components/shared/trend-charts';
import { EmptyState, Forbidden } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/form-controls';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'التقارير والمؤشرات' };

type Search = { from?: string; to?: string; report?: string };

// /admin/reports — لوحة المؤشرات M1–M10 (PRD §1.8) وتوليد التقارير ومراجعتها ونشرها (AC-15).
// الأرقام تُحسب على الخادم بنطاق reports:read، وتصل للعميل مجمّعة بلا بيانات شخصية (AC-14).
// مراجعة تقرير = ?report=<id> على المسار نفسه (لا مسار /admin/reports/[id] في §11.2).
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { user, allowed, backHref } = await guardPage('/admin/reports', 'reports:read');
  if (!allowed) return <Forbidden backHref={backHref} />;
  const scope = reportScope(user);
  if (!scope) return <Forbidden backHref={backHref} />;

  if (params.report) return <ReportReview user={user} scope={scope} reportId={params.report} />;

  const requested: Period | null = params.from && params.to ? { from: params.from, to: params.to } : null;
  const invalid = requested !== null && periodBounds(requested) === null;
  const period = requested && !invalid ? requested : defaultPeriod();
  const [snapshot, reports] = await Promise.all([
    collectMetrics(period, scope),
    db.report.findMany({
      where: visibleReportsWhere(user, scope),
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, title: true, period: true, periodStart: true, periodEnd: true, isPublished: true, createdAt: true },
    }),
  ]);
  // إخفاء بصري فقط — الحماية في generateReportAction (D35)
  const canCreate = can(user, 'reports:create');
  const scopeNote = scope.all ? 'كل المنصة' : 'لجانك فقط — المؤشرات العامة لا تُحسب بنطاق لجنة';

  return (
    <>
      <PageHeader
        title="التقارير والمؤشرات"
        description={`مؤشرات النجاح العشرة محسوبة الآن من قاعدة البيانات للفترة ${period.from} ← ${period.to}. النطاق: ${scopeNote}.`}
      />

      <Card className="mb-4 p-3">
        <form action="/admin/reports" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" role="search">
          <div className="flex flex-col gap-1">
            <Label htmlFor="from">من</Label>
            <Input id="from" name="from" type="date" required defaultValue={period.from} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="to">إلى</Label>
            <Input id="to" name="to" type="date" required defaultValue={period.to} />
          </div>
          <div className="flex gap-2">
            <Button type="submit">عرض الفترة</Button>
            {requested ? (
              <Button asChild variant="ghost">
                <Link href="/admin/reports">آخر 6 أشهر</Link>
              </Button>
            ) : null}
          </div>
        </form>
        {invalid ? (
          <Alert tone="warning" className="mt-3">
            الفترة المطلوبة غير صالحة: تأكد أن تاريخ «من» يسبق تاريخ «إلى» أو يساويه. تُعرض آخر 6 أشهر بدلًا منها.
          </Alert>
        ) : null}
      </Card>

      <p className="mb-2 text-xs text-muted-foreground">
        الأهداف المعروضة <strong>مقترحة</strong> في PRD §1.8 ولم يُقرّها المجلس بعد (Q10).
      </p>
      <MetricTiles snapshot={snapshot} />
      <div className="mt-5">
        <TrendCharts snapshot={snapshot} />
      </div>

      <div className={canCreate ? 'mt-6 grid gap-4 lg:grid-cols-[1fr_1.4fr]' : 'mt-6'}>
        {canCreate ? (
          <Card>
            <CardHeader>
              <CardTitle>توليد تقرير</CardTitle>
              <CardDescription>
                يحفظ أرقام الفترة كما هي الآن لقطةً ثابتة: لا تتغيّر لاحقًا حتى لو عُدّلت الشكاوى. يُراجَع ثم يُنشر.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={generateReportAction} resetOnSuccess>
                <Field name="title" label="عنوان التقرير">
                  <Input required maxLength={200} placeholder="مثال: تقرير الشفافية — أيلول" />
                </Field>
                <Field name="period" label="نوع الفترة">
                  <Select defaultValue="MONTHLY">
                    {REPORT_PERIODS.map((p) => (
                      <option key={p} value={p}>
                        {PERIOD_LABELS[p]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field name="from" label="من">
                    <Input type="date" required defaultValue={period.from} />
                  </Field>
                  <Field name="to" label="إلى">
                    <Input type="date" required defaultValue={period.to} max={toDateInput(new Date())} />
                  </Field>
                </div>
                <Field name="summary" label="ملخص (اختياري)" hint="يدعم **عريض** و*مائل* والقوائم (- بند) والروابط [نص](https://…). لا بيانات شخصية.">
                  <Textarea rows={4} maxLength={5000} />
                </Field>
                <SubmitButton>توليد التقرير</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        ) : null}

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">التقارير</h2>
          <DataTable
            rows={reports}
            rowKey={(r) => r.id}
            empty={{ title: 'لا تقارير بعد', hint: canCreate ? 'ولّد أول تقرير من النموذج المجاور، ثم راجعه وانشره.' : 'لم يُولَّد أي تقرير بعد. يولّده رئيس المجلس أو أمين السر.' }}
            columns={[
              {
                key: 'title',
                header: 'التقرير',
                cell: (r) => (
                  <Link href={`/admin/reports?report=${r.id}`} className="font-medium text-brand hover:underline">
                    {r.title}
                  </Link>
                ),
              },
              { key: 'period', header: 'الفترة', cell: (r) => `${formatDate(r.periodStart)} ← ${formatDate(r.periodEnd)}` },
              { key: 'kind', header: 'النوع', cell: (r) => PERIOD_LABELS[r.period] },
              { key: 'status', header: 'الحالة', cell: (r) => (r.isPublished ? 'منشور' : 'مسودة') },
            ]}
          />
        </section>
      </div>
    </>
  );
}

async function ReportReview({ user, scope, reportId }: { user: SessionUser; scope: ReportScope; reportId: string }) {
  const back = (
    <Button asChild variant="outline">
      <Link href="/admin/reports">عودة للتقارير</Link>
    </Button>
  );
  const isUuid = /^[0-9a-f-]{36}$/i.test(reportId);
  const report = isUuid
    ? await db.report.findFirst({
        where: { id: reportId, ...visibleReportsWhere(user, scope) },
        select: {
          id: true,
          title: true,
          period: true,
          metrics: true,
          summaryMd: true,
          isPublished: true,
          publishedAt: true,
          createdAt: true,
          createdBy: { select: { fullName: true } },
        },
      })
    : null;
  if (!report) {
    return (
      <>
        <PageHeader title="التقرير غير موجود">{back}</PageHeader>
        <Card>
          <EmptyState title="لم نجد هذا التقرير" hint="ربما حُذف الرابط أو لا يدخل في نطاقك. عد إلى قائمة التقارير واختر منها." />
        </Card>
      </>
    );
  }
  const snapshot = parseSnapshot(report.metrics);
  const canPublish = can(user, 'reports:publish') && !report.isPublished && snapshot?.scope === 'ALL';

  return (
    <>
      <PageHeader
        title={report.title}
        description={`${PERIOD_LABELS[report.period]} · ${snapshot ? `${snapshot.from} ← ${snapshot.to}` : ''} · وُلّد ${formatDateTime(report.createdAt)} بواسطة ${report.createdBy.fullName}`}
      >
        <div className="flex flex-wrap items-start gap-2">
          {snapshot && can(user, 'reports:export') ? (
            <>
              <DownloadButton action={exportReportAction} fields={{ reportId: report.id, format: 'pdf' }} label="PDF" />
              <DownloadButton action={exportReportAction} fields={{ reportId: report.id, format: 'xlsx' }} label="XLSX" />
            </>
          ) : null}
          {back}
        </div>
      </PageHeader>

      <Card className="mb-4 p-4">
        {report.isPublished ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>منشور منذ {formatDateTime(report.publishedAt)}.</span>
            <Link href={`/transparency/reports/${report.id}`} className="text-brand hover:underline">
              عرضه في صفحة الشفافية
            </Link>
          </div>
        ) : canPublish ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              مسودة. راجع الأرقام أدناه؛ بعد النشر تظهر للعامة في صفحة الشفافية كما هي، ولا يُعدَّل التقرير المنشور.
            </p>
            <ActionButtons items={[{ action: publishReportAction, fields: { reportId: report.id }, label: 'نشر في صفحة الشفافية', variant: 'default' }]} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            مسودة بانتظار النشر. النشر لرئيس المجلس وحده، ولتقرير مولَّد بنطاق كل المنصة.
          </p>
        )}
      </Card>

      {snapshot ? (
        <>
          <MetricTiles snapshot={snapshot} />
          <div className="mt-5">
            <TrendCharts snapshot={snapshot} />
          </div>
        </>
      ) : (
        <Alert tone="danger">لقطة هذا التقرير تالفة أو بصيغة قديمة ولا يمكن عرضها. ولّد تقريرًا جديدًا للفترة نفسها.</Alert>
      )}
      {report.summaryMd ? (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle>الملخص</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportSummary text={report.summaryMd} />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
