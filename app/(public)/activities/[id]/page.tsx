import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { ACTIVITY_KIND_LABELS, canRate, PUBLIC_ACTIVITY_STATUSES, registerBlocker, SEAT_HOLDING } from '@/lib/activities/workflow';
import { db } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';
import { registerAction } from '@/server/actions/activities';
import { RateForm } from '@/components/activities/rate-form';
import { ActionButtons } from '@/components/shared/action-buttons';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'نشاط' };
export const dynamic = 'force-dynamic';

// /activities/[id] — التفاصيل عامة؛ التسجيل والتقييم بـ activities:register (يُفحص في الخادم عند الإرسال)
export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await getCurrentUser();

  const a = await db.activity.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      kind: true,
      status: true,
      startsAt: true,
      endsAt: true,
      location: true,
      seats: true,
      registrationOpen: true,
      outcomes: true,
      isDemo: true,
      committee: { select: { nameAr: true, slug: true } },
      area: { select: { nameAr: true } },
      partners: { select: { organization: { select: { name: true } } } },
      _count: { select: { registrations: { where: { status: { in: SEAT_HOLDING } } } } },
    },
  });
  if (!a || !PUBLIC_ACTIVITY_STATUSES.includes(a.status)) notFound();

  const canRegister = can(user, 'activities:register');
  const mine =
    user && canRegister
      ? await db.activityRegistration.findUnique({
          where: { activityId_userId: { activityId: a.id, userId: user.id } },
          select: { status: true, rating: true, feedback: true },
        })
      : null;
  const blocker = registerBlocker(a);
  const left = a.seats !== null ? Math.max(0, a.seats - a._count.registrations) : null;

  return (
    <>
      <PageHeader title={a.title}>
        <StatusBadge kind="activity" status={a.status} size="md" />
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          {a.isDemo ? <Alert tone="warning">نشاط عرض تجريبي — ليس حقيقيًا.</Alert> : null}
          {a.description ? (
            <Card>
              <CardHeader>
                <CardTitle>عن النشاط</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-line">{a.description}</p>
              </CardContent>
            </Card>
          ) : null}
          {a.status === 'COMPLETED' && a.outcomes ? (
            <Card>
              <CardHeader>
                <CardTitle>المخرجات</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-line">{a.outcomes}</p>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>المشاركة</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {mine ? (
                <>
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    تسجيلك: <StatusBadge kind="registration" status={mine.status} />
                    {mine.status === 'WAITLISTED' ? <span className="text-muted-foreground">نتواصل معك إن فرغ مقعد.</span> : null}
                  </p>
                  {canRate(mine.status) ? (
                    <RateForm activityId={a.id} rating={mine.rating} feedback={mine.feedback} />
                  ) : mine.status === 'REGISTERED' ? (
                    <p className="text-xs text-muted-foreground">بعد النشاط تسجّل اللجنة الحضور، فيُفتح لك التقييم.</p>
                  ) : null}
                </>
              ) : blocker ? (
                <p className="text-sm text-muted-foreground">{blocker}</p>
              ) : !user ? (
                <p className="text-sm">
                  <Link href={`/login?next=/activities/${a.id}`} className="text-brand hover:underline">
                    سجّل الدخول
                  </Link>{' '}
                  لتسجّل في هذا النشاط.
                </p>
              ) : canRegister ? (
                <>
                  {left === 0 ? <p className="text-sm text-muted-foreground">اكتملت المقاعد: تسجيلك الآن يضعك في قائمة الانتظار.</p> : null}
                  <ActionButtons
                    items={[
                      {
                        action: registerAction,
                        fields: { activityId: a.id },
                        label: left === 0 ? 'انضم لقائمة الانتظار' : 'سجّلني',
                        variant: 'default',
                      },
                    ]}
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">التسجيل في الأنشطة متاح لحسابات الشباب والمؤسسات.</p>
              )}
            </CardContent>
          </Card>
        </div>
        <Card className="h-fit">
          <CardContent className="flex flex-col gap-2 pt-4 text-sm sm:pt-5">
            <p>
              <span className="text-muted-foreground">النوع: </span>
              {ACTIVITY_KIND_LABELS[a.kind]}
            </p>
            {a.committee ? (
              <p>
                <span className="text-muted-foreground">تنظّمه: </span>
                <Link href={`/committees/${a.committee.slug}`} className="text-brand hover:underline">
                  {a.committee.nameAr}
                </Link>
              </p>
            ) : null}
            <p>
              <span className="text-muted-foreground">الموعد: </span>
              {formatDateTime(a.startsAt)}
              {a.endsAt ? ` — ${formatDateTime(a.endsAt)}` : ''}
            </p>
            {a.location || a.area ? (
              <p>
                <span className="text-muted-foreground">المكان: </span>
                {[a.location, a.area?.nameAr].filter(Boolean).join(' · ')}
              </p>
            ) : null}
            <p>
              <span className="text-muted-foreground">المقاعد: </span>
              {a.seats === null ? 'بلا حد' : `${a.seats} (المتبقي ${left})`}
            </p>
            {a.partners.length ? (
              <p>
                <span className="text-muted-foreground">بالشراكة مع: </span>
                {a.partners.map((p) => p.organization.name).join('، ')}
              </p>
            ) : null}
            <Link href="/activities" className="text-brand hover:underline">
              كل الأنشطة
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
