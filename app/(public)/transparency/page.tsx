import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { parseSnapshot } from '@/lib/reports/metrics';
import { formatDate } from '@/lib/utils';
import { PERIOD_LABELS } from '@/lib/validation/reports';
import { PageHeader } from '@/components/shared/page-header';
import { MetricTiles } from '@/components/shared/report-snapshot';
import { EmptyState } from '@/components/shared/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';
import { COUNCIL_NAME_AR } from '@/lib/config';

export const metadata: Metadata = { title: 'شفافية المجلس' };
export const dynamic = 'force-dynamic';

// /transparency — عام بلا تسجيل دخول (AC-15 ③). يقرأ التقارير المنشورة فقط، ولقطاتها المحفوظة لا أرقامًا حيّة.
export default async function TransparencyPage() {
  const reports = await db.report.findMany({
    where: { isPublished: true },
    orderBy: [{ periodEnd: 'desc' }, { publishedAt: 'desc' }],
    take: 50,
    select: { id: true, title: true, period: true, periodStart: true, periodEnd: true, publishedAt: true, metrics: true },
  });
  const latest = reports[0];
  const latestSnapshot = latest ? parseSnapshot(latest.metrics) : null;

  return (
    <>
      <PageHeader
        title="شفافية المجلس"
        description={`تقارير دورية بأرقام ${COUNCIL_NAME_AR} كما وُثّقت لحظة إعدادها: الشكاوى وسرعة التعامل معها، والأفكار، والدعم، وانضباط اللجان.`}
      />
      {reports.length === 0 ? (
        <Card>
          <EmptyState title="لم يُنشر أي تقرير بعد" hint="ينشر المجلس تقاريره هنا تباعًا. عد لاحقًا، أو تابع شكواك من صفحة التتبّع." />
        </Card>
      ) : (
        <>
          {latest && latestSnapshot ? (
            <section className="mb-6 flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold">أحدث تقرير: {latest.title}</h2>
                <Link href={`/transparency/reports/${latest.id}`} className="text-sm text-brand hover:underline">
                  التقرير كاملًا
                </Link>
              </div>
              <MetricTiles snapshot={latestSnapshot} showTargets={false} />
            </section>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>كل التقارير المنشورة</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y">
                {reports.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                    <Link href={`/transparency/reports/${r.id}`} className="font-medium text-brand hover:underline">
                      {r.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {PERIOD_LABELS[r.period]} · {formatDate(r.periodStart)} ← {formatDate(r.periodEnd)} · نُشر {formatDate(r.publishedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
