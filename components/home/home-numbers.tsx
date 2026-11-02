import Link from 'next/link';
import { CircleCheck, HeartHandshake, Timer, Users, type LucideIcon } from 'lucide-react';
import { db } from '@/lib/db';
import { formatMetric, METRICS, parseSnapshot, type MetricKey } from '@/lib/reports/metrics';
import { formatDate } from '@/lib/utils';
import { StatTile } from '@/components/shared/stat-tile';
import { Alert, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui/surface';

// «المجلس بالأرقام» — من آخر تقرير منشور فقط (لقطة ثابتة — AC-15)، لا مؤشرات حيّة:
// المؤشرات الداخلية لمن يملك reports:read، والعامة ترى ما أقرّ المجلس نشره.
const HIGHLIGHTS: MetricKey[] = ['M2', 'M3', 'M4', 'M6'];
const ICONS: Partial<Record<MetricKey, LucideIcon>> = { M2: Users, M3: Timer, M4: CircleCheck, M6: HeartHandshake };

async function loadLatest() {
  const [latest, publishedCount] = await Promise.all([
    db.report.findFirst({
      where: { isPublished: true },
      orderBy: [{ periodEnd: 'desc' }, { publishedAt: 'desc' }],
      select: { id: true, title: true, periodStart: true, periodEnd: true, metrics: true },
    }),
    db.report.count({ where: { isPublished: true } }),
  ]);
  return { latest, snapshot: latest ? parseSnapshot(latest.metrics) : null, publishedCount };
}

export async function HomeNumbers() {
  const data = await loadLatest().catch(() => null);
  if (!data) {
    return <Alert tone="warning">تعذّر تحميل الأرقام الآن. التقارير المنشورة متاحة في صفحة الشفافية.</Alert>;
  }
  const { latest, snapshot, publishedCount } = data;
  if (!latest || !snapshot) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>لم يُنشر أي تقرير بعد</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-7 text-muted-foreground">
          ينشر المجلس تقارير دورية بأرقام موثّقة: عدد الشكاوى وسرعة التعامل معها، ونسبة ما حُلّ منها، والدعم الذي وصل. تظهر هنا
          حين يُنشر أولها.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        من أحدث تقرير منشور:{' '}
        <Link href={`/transparency/reports/${latest.id}`} className="text-brand hover:underline">
          <bdi>{latest.title}</bdi>
        </Link>{' '}
        · {formatDate(latest.periodStart)} ← {formatDate(latest.periodEnd)}
        {publishedCount > 1 ? (
          <>
            {' '}
            ·{' '}
            <Link href="/transparency" className="text-brand hover:underline">
              كل التقارير ({publishedCount})
            </Link>
          </>
        ) : null}
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {HIGHLIGHTS.map((k) => {
          const shown = formatMetric(k, snapshot.values[k]);
          return (
            <StatTile
              key={k}
              label={METRICS[k].label}
              value={shown}
              noData={shown === null}
              meta={METRICS[k].definition}
              tone="brand"
              icon={ICONS[k]}
            />
          );
        })}
      </div>
    </div>
  );
}

export function HomeNumbersSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy aria-label="جارٍ تحميل الأرقام">
      {HIGHLIGHTS.map((k) => (
        <Card key={k} className="flex flex-col gap-2 p-4">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-7 w-1/2" />
        </Card>
      ))}
    </div>
  );
}
