import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { securedByInitiative } from '@/lib/initiatives/queries';
import { formatMoney, OPEN_NEED_STATUSES, PUBLIC_INITIATIVE_STATUSES } from '@/lib/initiatives/workflow';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'المبادرات' };
export const dynamic = 'force-dynamic';

// /initiatives — عام. المعتمدة من الرئيس فقط (§5.3 · AC-09).
export default async function InitiativesPage() {
  const initiatives = await db.initiative.findMany({
    where: { status: { in: PUBLIC_INITIATIVE_STATUSES } },
    orderBy: [{ isFlagship: 'desc' }, { approvedAt: 'desc' }],
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      status: true,
      progressPct: true,
      committee: { select: { nameAr: true } },
      _count: { select: { needs: { where: { status: { in: OPEN_NEED_STATUSES } } }, partners: true } },
    },
  });
  const secured = await securedByInitiative(initiatives.map((i) => i.id));

  return (
    <>
      <PageHeader title="مبادرات الشباب" description="مبادرات اعتمدها المجلس، باحتياجات مرقّمة وشركاء ومبلغ مؤمَّن من قيود معتمدة." />
      {initiatives.length === 0 ? (
        <Card>
          <EmptyState title="لا مبادرات منشورة بعد" hint="تُنشر المبادرة هنا بعد اعتماد رئيس المجلس لها. تابع الأفكار التي قد تتحول إلى مبادرات." />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {initiatives.map((i) => {
            const totals = Object.entries(secured.get(i.id) ?? {});
            return (
              <Link key={i.id} href={`/initiatives/${i.slug}`} className="rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
                <Card className="flex h-full flex-col gap-2 p-4 transition-colors hover:bg-muted/50">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-brand">{i.title}</p>
                    <StatusBadge kind="initiative" status={i.status} />
                  </div>
                  {i.summary ? <p className="line-clamp-2 text-sm text-muted-foreground">{i.summary}</p> : null}
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={i.progressPct} aria-valuemin={0} aria-valuemax={100} aria-label="نسبة الإنجاز">
                    <div className="h-full bg-brand" style={{ width: `${i.progressPct}%` }} />
                  </div>
                  <p className="mt-auto text-xs text-muted-foreground">
                    {i.committee?.nameAr} · {i._count.needs} احتياج مفتوح · {i._count.partners} شريك
                    {totals.length ? ` · مؤمَّن ${totals.map(([c, v]) => formatMoney(v, c)).join(' + ')}` : ''}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
