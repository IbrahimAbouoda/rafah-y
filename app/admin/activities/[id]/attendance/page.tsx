import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { attendanceBlocker, ratingSummary } from '@/lib/activities/workflow';
import { db } from '@/lib/db';
import { guardPage } from '@/lib/page-guard';
import { can } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';
import { AttendanceForm } from '@/components/activities/attendance-form';
import { PageHeader } from '@/components/shared/page-header';
import { DownloadButton } from '@/components/shared/download-button';
import { exportAttendanceAction } from '@/server/actions/activities/export';
import { EmptyState, Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'الحضور والتقييم' };

// /admin/activities/[id]/attendance — activities:attendance بنطاق لجنة النشاط (AC-13 ④)
export default async function AttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, allowed, backHref } = await guardPage(`/admin/activities/${id}/attendance`, 'activities:attendance');
  if (!allowed) return <Forbidden backHref={backHref} />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const activity = await db.activity.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, startsAt: true, seats: true, committeeId: true, committee: { select: { nameAr: true, slug: true } } },
  });
  // نشاط لجنة أخرى = غير موجود، فلا يكشف التخمين وجوده
  if (!activity || !can(user, 'activities:attendance', { committeeId: activity.committeeId })) notFound();

  const registrations = await db.activityRegistration.findMany({
    where: { activityId: activity.id, status: { not: 'CANCELLED' } },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      status: true,
      rating: true,
      feedback: true,
      attendanceMarkedAt: true,
      user: { select: { fullName: true } },
      attendanceMarkedBy: { select: { fullName: true } },
    },
  });
  const blocker = attendanceBlocker(activity);
  // الحاضرون وحدهم — تقييم من صار «لم يحضر» لا يُحتسب
  const { average: avg, rated } = ratingSummary(registrations);

  return (
    <>
      <PageHeader title={`الحضور: ${activity.title}`} description={`${activity.committee?.nameAr ?? ''} · ${formatDateTime(activity.startsAt)}`}>
        <div className="flex items-center gap-2">
          <StatusBadge kind="activity" status={activity.status} size="md" />
          {registrations.length > 0 ? (
            <DownloadButton action={exportAttendanceAction} fields={{ activityId: activity.id }} label="تصدير (XLSX)" />
          ) : null}
          {activity.committee ? (
            <Link href={`/admin/committees/${activity.committee.slug}`} className="text-sm text-brand hover:underline">
              لوحة اللجنة
            </Link>
          ) : null}
        </div>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle>المسجّلون ({registrations.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {registrations.length === 0 ? (
              <EmptyState title="لم يسجّل أحد بعد" hint="حين ينشر النشاط والتسجيل مفتوح، يظهر المسجّلون هنا لتسجيل حضورهم بعد بدئه." />
            ) : blocker ? (
              <>
                <Alert tone="info">{blocker}</Alert>
                <ul className="flex flex-col divide-y rounded-lg border text-sm">
                  {registrations.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 p-3">
                      {r.user.fullName}
                      <StatusBadge kind="registration" status={r.status} />
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <AttendanceForm
                activityId={activity.id}
                rows={registrations.map((r) => ({
                  id: r.id,
                  name: r.user.fullName,
                  status: r.status,
                  markedBy: r.attendanceMarkedBy?.fullName ?? null,
                  markedAt: r.attendanceMarkedAt,
                }))}
              />
            )}
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>التقييمات</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {avg === null ? (
              <p className="text-muted-foreground">لا تقييمات بعد. يقيّم الحاضرون بعد تسجيل حضورهم.</p>
            ) : (
              <>
                <p>
                  المتوسط <span className="font-semibold">{avg.toFixed(1)}</span> من 5 · {rated.length} تقييم
                </p>
                <ul className="flex flex-col gap-2">
                  {rated
                    .filter((r) => r.feedback)
                    .map((r) => (
                      <li key={r.id} className="rounded-lg bg-muted/50 p-2">
                        <span className="text-xs text-muted-foreground">{r.rating}/5</span>
                        <p className="whitespace-pre-line">{r.feedback}</p>
                      </li>
                    ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
