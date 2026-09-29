'use client';

import { formatTrendValue, type TrendUnit } from '@/lib/reports/format';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type DotItemDotProps } from 'recharts';

// TrendChart — PRD §12. البيانات تُحسب على الخادم وتصل مجمّعة بلا أي بيانات شخصية.
// المحور الزمني يُقرأ من اليمين (reversed)، والألوان من tokens في app/globals.css فتتبع الوضع الداكن.
// أقل من نقطتين ⇒ رسالة لا رسم · جدول بديل لقارئ الشاشة إلزامي.

type Row = Record<string, string | number | null>;

const num = new Intl.NumberFormat('ar-PS-u-nu-latn');

/** عدد النقاط القابلة للرسم — مُصدَّرة للاختبار */
export const plottablePoints = (series: readonly Row[], yKey: string) =>
  series.filter((r) => typeof r[yKey] === 'number').length;

export function TrendChart({
  series,
  xKey,
  yKey,
  height = 220,
  ariaLabel,
  unit = 'count',
}: {
  series: Row[];
  xKey: string;
  yKey: string;
  height?: number;
  ariaLabel: string;
  unit?: TrendUnit;
}) {
  if (plottablePoints(series, yKey) < 2) {
    return (
      <p className="flex items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground" style={{ minHeight: height }}>
        لا تكفي البيانات لرسم اتجاه بعد — نحتاج نقطتين على الأقل.
      </p>
    );
  }

  const lastIndex = series.findLastIndex((r) => typeof r[yKey] === 'number');

  return (
    <figure className="m-0">
      <div role="img" aria-label={ariaLabel} style={{ height }} className="w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey={xKey}
              reversed
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              interval="preserveStartEnd"
              minTickGap={12}
            />
            <YAxis
              orientation="right"
              width={44}
              allowDecimals={unit !== 'count'}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => (unit === 'ratio' ? `${Math.round(v * 100)}%` : num.format(v))}
              domain={unit === 'ratio' ? [0, 1] : [0, 'auto']}
            />
            <Tooltip
              cursor={{ stroke: 'var(--border)' }}
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--foreground)',
                direction: 'rtl',
              }}
              labelStyle={{ color: 'var(--muted-foreground)' }}
              formatter={(v) => [formatTrendValue(typeof v === 'number' ? v : null, unit), ariaLabel]}
            />
            <Line
              type="monotone"
              dataKey={yKey}
              stroke="var(--brand)"
              strokeWidth={2}
              connectNulls
              isAnimationActive={false}
              dot={(props: DotItemDotProps) => {
                const last = props.index === lastIndex;
                if (props.cx === undefined || props.cy === undefined) return <g key={props.index} />;
                return (
                  <circle
                    key={props.index}
                    cx={props.cx}
                    cy={props.cy}
                    r={last ? 5 : 2.5}
                    fill={last ? 'var(--brand)' : 'var(--surface)'}
                    stroke="var(--brand)"
                    strokeWidth={last ? 2 : 1.5}
                  />
                );
              }}
              activeDot={{ r: 5, fill: 'var(--brand)', stroke: 'var(--surface)' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <tbody>
          {series.map((r) => (
            <tr key={String(r[xKey])}>
              <th scope="row">{String(r[xKey])}</th>
              <td>{formatTrendValue(r[yKey] as number | null, unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
