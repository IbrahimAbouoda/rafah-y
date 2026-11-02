import type { MetricsSnapshot } from '@/lib/reports/metrics';
import { TrendChart } from '@/components/shared/trend-chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

// اتجاهات لقطة المؤشرات — منفصلة عن report-snapshot.tsx كي لا تحمل الصفحات التي لا ترسم مكتبة recharts.

export function TrendCharts({ snapshot }: { snapshot: MetricsSnapshot }) {
  const series = snapshot.trend.map((p) => ({ ...p }));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
