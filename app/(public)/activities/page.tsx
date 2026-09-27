import type { Metadata } from 'next';
import Link from 'next/link';
import { ACTIVITY_KIND_LABELS, SEAT_HOLDING } from '@/lib/activities/workflow';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'الأنشطة والورش' };
export const dynamic = 'force-dynamic';

// /activities — عام: القادمة المنشورة أولًا، ثم المنتهية بمخرجاتها (§5.5 «مخرجات وتوثيق»)
export default async function ActivitiesPage() {
  const now = new Date();
  const select = {
    id: true,
    title: true,
    kind: true,
    status: true,
    startsAt: true,
    location: true,
    seats: true,
    registrationOpen: true,
    isDemo: true,
    committee: { select: { nameAr: true } },
    _count: { select: { registrations: { where: { status: { in: SEAT_HOLDING } } } } },
  } as const;
  const [upcoming, past] = await Promise.all([
    db.activity.findMany({ where: { status: 'PUBLISHED', startsAt: { gte: now } }, orderBy: { startsAt: 'asc' }, take: 50, select }),
    db.activity.findMany({
      where: { OR: [{ status: 'COMPLETED' }, { status: 'PUBLISHED', startsAt: { lt: now } }] },
      orderBy: { startsAt: 'desc' },
      take: 20,
      select,
    }),
  ]);

  const list = (rows: typeof upcoming) => (
    <ul className="grid gap-3 sm:grid-cols-2">
      {rows.map((a) => {
        const left = a.seats !== null ? Math.max(0, a.seats - a._count.registrations) : null;
        return (
          <li key={a.id}>
            <Card className="flex h-full flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/activities/${a.id}`} className="font-semibold text-brand hover:underline">
                  {a.title}
                </Link>
                <StatusBadge kind="activity" status={a.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                {ACTIVITY_KIND_LABELS[a.kind]} · {a.committee?.nameAr}
                {a.isDemo ? ' · بيانات عرض' : ''}
              </p>
              <p className="mt-auto text-sm">
                {formatDateTime(a.startsAt)}
                {a.location ? ` · ${a.location}` : ''}
              </p>
              {a.status === 'PUBLISHED' && a.startsAt >= now ? (
                <p className="text-xs text-muted-foreground">
                  {!a.registrationOpen
                    ? 'التسجيل مغلق'
                    : left === null
                      ? 'التسجيل مفتوح'
                      : left > 0
                        ? `${left} مقعد متبقٍ`
                        : 'اكتملت المقاعد — التسجيل الآن في قائمة الانتظار'}
                </p>
              ) : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <PageHeader title="الأنشطة والورش" description="أنشطة لجان المجلس وورشها. سجّل، واحضر، ثم قيّم التجربة." />
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">القادمة</h2>
        {upcoming.length === 0 ? (
          <Card>
            <EmptyState title="لا أنشطة قادمة الآن" hint="تنشر اللجان أنشطتها هنا حين تُعتمد. تابع هذه الصفحة أو صوّت على مجالات التدريب التي تريدها.">
              <Link href="/demand" className="text-sm text-brand hover:underline">
                صوّت على مجالات التدريب
              </Link>
            </EmptyState>
          </Card>
        ) : (
          list(upcoming)
        )}
      </section>
      {past.length > 0 ? (
        <section className="mt-6 flex flex-col gap-3">
          <h2 className="font-semibold">أُقيمت مؤخرًا</h2>
          {list(past)}
        </section>
      ) : null}
    </>
  );
}
