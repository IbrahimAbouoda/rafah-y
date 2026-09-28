import { formatMetric, formatTarget, meetsTarget, METRIC_KEYS, METRICS, type MetricKey, type MetricsSnapshot } from '@/lib/reports/metrics';
import { Markdown } from '@/lib/markdown';
import { StatTile } from '@/components/shared/stat-tile';
import { TrendChart } from '@/components/shared/trend-chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

// عرض لقطة مؤشرات — نفسه في اللوحة (حيّة)، ومراجعة التقرير، وصفحة الشفافية العامة (لقطة محفوظة).
// لا يحمل إلا ما في MetricsSnapshot: أرقام مجمّعة وتواريخ، بلا أي بيانات شخصية.

export function MetricTiles({ snapshot, showTargets = true }: { snapshot: MetricsSnapshot; showTargets?: boolean }) {
  const scoped = snapshot.scope !== 'ALL';
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {METRIC_KEYS.map((k) => (
        <MetricTile key={k} k={k} value={snapshot.values[k]} scoped={scoped} showTarget={showTargets} />
      ))}
    </div>
  );
}

function MetricTile({ k, value, scoped, showTarget }: { k: MetricKey; value: number | null; scoped: boolean; showTarget: boolean }) {
  const def = METRICS[k];
  const shown = formatMetric(k, value);
  const met = showTarget ? meetsTarget(k, value) : null;
  const reason = shown === null ? (def.pending ?? (scoped && def.global ? 'مؤشر عام لا يُحسب بنطاق لجنة' : null)) : null;
  return (
    <StatTile
      label={`${def.key} · ${def.label}`}
      value={shown}
      noData={shown === null}
      tone={met === null ? 'default' : met ? 'success' : 'warning'}
      meta={reason ?? (showTarget ? `${def.definition} · الهدف المقترح: ${formatTarget(k)}` : def.definition)}
    />
  );
}

export function TrendCharts({ snapshot }: { snapshot: MetricsSnapshot }) {
  const series = snapshot.trend.map((p) => ({ ...p }));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>الشكاوى شهريًا</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart series={series} xKey="month" yKey="complaints" ariaLabel="عدد الشكاوى المقدّمة في كل شهر" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>وسيط زمن الفرز (M3)</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart
            series={series}
            xKey="month"
            yKey="triageMedianHours"
            unit="hours"
            ariaLabel="وسيط الساعات من تقديم الشكوى إلى تحويلها للجنة، لكل شهر"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>نسبة الإغلاق (M4)</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart series={series} xKey="month" yKey="closureRate" unit="ratio" ariaLabel="نسبة شكاوى كل شهر التي حُلّت أو أُغلقت" />
        </CardContent>
      </Card>
    </div>
  );
}

/** ملخص التقرير — Markdown عبر المُنقّي (§6.3) */
export function ReportSummary({ text }: { text: string | null }) {
  return <Markdown text={text} />;
}
