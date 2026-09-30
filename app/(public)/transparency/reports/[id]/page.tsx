import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { parseSnapshot } from '@/lib/reports/metrics';
import { formatDate, formatDateTime } from '@/lib/utils';
import { PERIOD_LABELS } from '@/lib/validation/reports';
import { PageHeader } from '@/components/shared/page-header';
import { MetricTiles, ReportSummary } from '@/components/shared/report-snapshot';
import { TrendCharts } from '@/components/shared/trend-charts';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'تقرير منشور' };
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /transparency/reports/[id] — تقرير منشور بلقطته المحفوظة (AC-15 ②③). المسودة غير موجودة لمن لا يملك النشر.
export default async function PublishedReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const report = await db.report.findFirst({
    where: { id, isPublished: true },
    select: { title: true, period: true, periodStart: true, periodEnd: true, publishedAt: true, metrics: true, summaryMd: true },
  });
  if (!report) notFound();
  const snapshot = parseSnapshot(report.metrics);

  return (
    <>
      <PageHeader
        title={report.title}
        description={`${PERIOD_LABELS[report.period]} · ${formatDate(report.periodStart)} ← ${formatDate(report.periodEnd)} · نُشر ${formatDateTime(report.publishedAt)}`}
      >
        <Button asChild variant="outline">
          <Link href="/transparency">كل التقارير</Link>
        </Button>
      </PageHeader>
      {report.summaryMd ? (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>ملخص المجلس</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportSummary text={report.summaryMd} />
          </CardContent>
        </Card>
      ) : null}
      {snapshot ? (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            الأرقام لقطة محفوظة وقت إعداد التقرير ({formatDateTime(new Date(snapshot.generatedAt))})، ولا تتغيّر بتغيّر البيانات بعده.
          </p>
          <MetricTiles snapshot={snapshot} showTargets={false} />
          <div className="mt-5">
            <TrendCharts snapshot={snapshot} />
          </div>
        </>
      ) : (
        <Alert tone="danger">تعذّر عرض أرقام هذا التقرير. أبلغ المجلس عبر صفحة الدعم ليعيد نشره.</Alert>
      )}
    </>
  );
}
