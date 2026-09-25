import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { nextIdeaStatuses } from '@/lib/ideas/workflow';
import { guardPage } from '@/lib/page-guard';
import { can } from '@/lib/rbac';
import { formatDate } from '@/lib/utils';
import { IdeaReviewPanel, type IdeaActions } from '@/components/ideas/review-panel';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'مراجعة فكرة' };

// /admin/ideas/[id] — ideas:review بنطاق الفكرة (AC-08)
export default async function AdminIdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, allowed, backHref } = await guardPage(`/admin/ideas/${id}`, 'ideas:review');
  if (!allowed) return <Forbidden backHref={backHref} />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const idea = await db.idea.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      title: true,
      problem: true,
      solution: true,
      estimatedCost: true,
      status: true,
      voteCount: true,
      committeeId: true,
      reviewNote: true,
      decidedAt: true,
      createdAt: true,
      committee: { select: { nameAr: true } },
      area: { select: { nameAr: true } },
      decidedBy: { select: { fullName: true } },
      mergedInto: { select: { reference: true, id: true } },
      mergedFrom: { select: { reference: true, id: true, title: true } },
    },
  });
  // فكرة خارج نطاقه = غير موجودة (رئيس لجنة لا يرى لجنة غيره)
  if (!idea || !can(user, 'ideas:review', { committeeId: idea.committeeId })) notFound();

  const ctx = { committeeId: idea.committeeId };
  const reviewNext = nextIdeaStatuses(idea.status, 'ideas:review');
  const actions: IdeaActions = {
    screen: reviewNext.includes('SCREENING'),
    toCommittee: reviewNext.includes('COMMITTEE_REVIEW')
      ? {
          committees: await db.committee.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select: { id: true, nameAr: true },
          }),
        }
      : null,
    requestChanges: reviewNext.includes('CHANGES_REQUESTED'),
    merge: can(user, 'ideas:merge', ctx) && nextIdeaStatuses(idea.status, 'ideas:merge').length > 0,
    decide: can(user, 'ideas:approve', ctx) && nextIdeaStatuses(idea.status, 'ideas:approve').length > 0,
  };

  return (
    <>
      <PageHeader title={idea.title} description={`${idea.voteCount} صوت تأييد — مؤشر أولوية لا يعتمد الفكرة وحده.`}>
        <StatusBadge kind="idea" status={idea.status} size="md" />
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="grid gap-2 pt-4 text-sm sm:grid-cols-2 sm:pt-5">
              <p>
                <span className="text-muted-foreground">الرقم: </span>
                <span className="font-mono" dir="ltr">
                  {idea.reference}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">قُدّمت: </span>
                {formatDate(idea.createdAt)}
              </p>
              <p>
                <span className="text-muted-foreground">اللجنة: </span>
                {idea.committee?.nameAr ?? 'لم تُحَل بعد'}
              </p>
              <p>
                <span className="text-muted-foreground">المنطقة: </span>
                {idea.area?.nameAr ?? '—'}
              </p>
              <p>
                <span className="text-muted-foreground">الكلفة التقديرية: </span>
                {idea.estimatedCost ? `${Number(idea.estimatedCost).toLocaleString('ar-PS-u-nu-latn')} ₪` : '—'}
              </p>
              {idea.decidedAt ? (
                <p>
                  <span className="text-muted-foreground">القرار: </span>
                  {idea.decidedBy?.fullName} · {formatDate(idea.decidedAt)}
                </p>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>المشكلة</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-line">{idea.problem}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>الحل المقترح</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-line">{idea.solution}</p>
            </CardContent>
          </Card>
          {idea.reviewNote ? <Alert tone="info">آخر ملاحظة مراجعة: {idea.reviewNote}</Alert> : null}
          {idea.mergedInto ? (
            <Alert tone="info">
              مدموجة في{' '}
              <Link href={`/admin/ideas/${idea.mergedInto.id}`} className="underline">
                {idea.mergedInto.reference}
              </Link>
            </Alert>
          ) : null}
          {idea.mergedFrom.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>أفكار مدموجة فيها</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1 text-sm">
                  {idea.mergedFrom.map((m) => (
                    <li key={m.id}>
                      <Link href={`/admin/ideas/${m.id}`} className="text-brand hover:underline">
                        {m.title} ({m.reference})
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
        <IdeaReviewPanel ideaId={idea.id} actions={actions} />
      </div>
    </>
  );
}
