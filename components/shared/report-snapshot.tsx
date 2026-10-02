import { formatMetric, formatTarget, meetsTarget, METRIC_KEYS, METRICS, type MetricKey, type MetricsSnapshot } from '@/lib/reports/metrics';
import { Markdown } from '@/lib/markdown';
import { StatTile } from '@/components/shared/stat-tile';

// عرض لقطة مؤشرات — نفسه في اللوحة (حيّة)، ومراجعة التقرير، وصفحة الشفافية العامة (لقطة محفوظة).
// لا يحمل إلا ما في MetricsSnapshot: أرقام مجمّعة وتواريخ، بلا أي بيانات شخصية.
// الرسوم في trend-charts.tsx: recharts (≈ 100 ك.ب) لا يُحمَّل في صفحة لا ترسم (مثل /transparency).

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

/** ملخص التقرير — Markdown عبر المُنقّي (§6.3) */
export function ReportSummary({ text }: { text: string | null }) {
  return <Markdown text={text} />;
}
