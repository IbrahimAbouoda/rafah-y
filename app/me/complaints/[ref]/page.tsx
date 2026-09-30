import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { guardPage } from '@/lib/page-guard';
import { can } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';
import { WorkflowTimeline } from '@/components/complaints/workflow-timeline';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'مسار شكواي' };

export default async function MyComplaintPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const reference = decodeURIComponent(ref).toUpperCase();
  const { user, allowed, backHref } = await guardPage(`/me/complaints/${ref}`, 'complaints:read');
  if (!allowed) return <Forbidden backHref={backHref} />;

  // الشرط submitterId = المستخدم جزء من الاستعلام: شكوى غيره = غير موجودة، لا «ممنوعة» تكشف وجودها
  const complaint = await db.complaint.findFirst({
    where: { reference, submitterId: user.id },
    select: {
      reference: true,
      title: true,
      body: true,
      status: true,
      submitterId: true,
      createdAt: true,
      category: { select: { nameAr: true } },
      area: { select: { nameAr: true } },
      committee: { select: { nameAr: true } },
      events: {
        where: { isPublic: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, toStatus: true, note: true, createdAt: true },
      },
    },
  });
  if (!complaint || !can(user, 'complaints:read', { ownerId: complaint.submitterId })) notFound();

  return (
    <>
      <PageHeader title={complaint.title}>
        <StatusBadge kind="complaint" status={complaint.status} size="md" />
      </PageHeader>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle>المسار</CardTitle>
          </CardHeader>
          <CardContent>
            <WorkflowTimeline
              currentStatus={complaint.status}
              events={complaint.events.map((e) => ({ id: e.id, toStatus: e.toStatus, note: e.note, at: e.createdAt }))}
            />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-2 pt-4 text-sm sm:pt-5">
              <p>
                <span className="text-muted-foreground">الرقم: </span>
                <span className="font-mono" dir="ltr">
                  {complaint.reference}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">قُدّمت: </span>
                {formatDateTime(complaint.createdAt)}
              </p>
              <p>
                <span className="text-muted-foreground">التصنيف: </span>
                {complaint.category?.nameAr ?? '—'}
              </p>
              <p>
                <span className="text-muted-foreground">المنطقة: </span>
                {complaint.area?.nameAr ?? '—'}
              </p>
              <p>
                <span className="text-muted-foreground">اللجنة المسؤولة: </span>
                {complaint.committee?.nameAr ?? 'لم تُحدَّد بعد'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>ما كتبته</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-line">{complaint.body}</p>
            </CardContent>
          </Card>
          <Link href="/me/complaints" className="text-sm text-brand hover:underline">
            العودة إلى شكاواي
          </Link>
        </div>
      </div>
    </>
  );
}
