import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { landingPath } from '@/lib/nav';
import { formatMetric, METRICS, parseSnapshot, type MetricKey } from '@/lib/reports/metrics';
import { formatDate } from '@/lib/utils';
import { StatTile } from '@/components/shared/stat-tile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';
import { COUNCIL_NAME_AR } from '@/lib/config';

export const metadata: Metadata = { title: 'نبض رفح — منصة الشباب' };
export const dynamic = 'force-dynamic';

// / — الرئيسية (PRD §11.2). عامة بلا تسجيل دخول.
// أرقامها من آخر تقرير منشور فقط (لقطة ثابتة — AC-15)، لا مؤشرات حيّة: المؤشرات الداخلية لمن يملك reports:read.
const HIGHLIGHTS: MetricKey[] = ['M2', 'M3', 'M4', 'M6'];

const PATHS = [
  { href: '/complaints/public-new', title: 'قدّم شكوى', text: 'مشكلة في حيّك أو خدمة؟ اكتبها، ولو بلا حساب، واحصل على رقم مرجعي تتابعها به.' },
  { href: '/ideas', title: 'شارك فكرة', text: 'اقترح حلًا وصوّت على أفكار غيرك. الأفكار المعتمدة تصير مبادرات.' },
  { href: '/initiatives', title: 'المبادرات', text: 'ما تعمل عليه اللجان الآن، واحتياجاته المرقّمة، ومن يدعمه.' },
  { href: '/opportunities', title: 'الفرص', text: 'تدريب ومنح وفرص عمل وتطوع من المؤسسات الشريكة.' },
  { href: '/activities', title: 'الأنشطة', text: 'ورش وفعاليات وحملات — سجّل وشارك.' },
  { href: '/help', title: 'اسأل', text: 'إجابات معتمدة من المجلس، وما لا تجده يصل لفريقه.' },
] as const;

export default async function HomePage() {
  const [user, latest, publishedCount] = await Promise.all([
    getCurrentUser(),
    db.report.findFirst({
      where: { isPublished: true },
      orderBy: [{ periodEnd: 'desc' }, { publishedAt: 'desc' }],
      select: { id: true, title: true, periodStart: true, periodEnd: true, metrics: true },
    }),
    db.report.count({ where: { isPublished: true } }),
  ]);
  const snapshot = latest ? parseSnapshot(latest.metrics) : null;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 rounded-2xl bg-brand-soft p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-brand sm:text-3xl">نبض رفح</h1>
        <p className="max-w-2xl text-base leading-8">
          منصة {COUNCIL_NAME_AR}: شكاوى الشباب وأفكارهم ومبادراتهم تدخل بمسار موثّق، تعمل عليها تسع لجان، وتُنشر
          نتائجها للجميع.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/complaints/public-new">قدّم شكوى</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/track">تتبّع شكوى</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/how-it-works">كيف تعمل المنصة</Link>
          </Button>
          {user ? (
            <Button asChild variant="ghost">
              <Link href={landingPath(user)}>لوحتي</Link>
            </Button>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="paths" className="flex flex-col gap-3">
        <h2 id="paths" className="text-lg font-semibold">
          ماذا تستطيع أن تفعل
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PATHS.map((p) => (
            <li key={p.href}>
              <Link href={p.href} className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
                <Card className="flex h-full flex-col gap-1 p-4 transition-colors hover:bg-muted/50">
                  <span className="font-semibold text-brand">{p.title}</span>
                  <span className="text-sm text-muted-foreground">{p.text}</span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="transparency" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="transparency" className="text-lg font-semibold">
            الشفافية بالأرقام
          </h2>
          <Link href="/transparency" className="text-sm text-brand hover:underline">
            كل التقارير المنشورة{publishedCount ? ` (${publishedCount})` : ''}
          </Link>
        </div>
        {latest && snapshot ? (
          <>
            <p className="text-sm text-muted-foreground">
              من أحدث تقرير منشور:{' '}
              <Link href={`/transparency/reports/${latest.id}`} className="text-brand hover:underline">
                {latest.title}
              </Link>{' '}
              · {formatDate(latest.periodStart)} ← {formatDate(latest.periodEnd)}
            </p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {HIGHLIGHTS.map((k) => {
                const shown = formatMetric(k, snapshot.values[k]);
                return <StatTile key={k} label={METRICS[k].label} value={shown} noData={shown === null} meta={METRICS[k].definition} />;
              })}
            </div>
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>لم يُنشر أي تقرير بعد</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              ينشر المجلس تقارير دورية بأرقام موثّقة: عدد الشكاوى وسرعة التعامل معها، ونسبة ما حُلّ منها، والدعم الذي وصل. تظهر هنا
              حين يُنشر أولها.
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
