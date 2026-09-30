import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { voteModes } from '@/lib/ideas/public';
import { PUBLIC_IDEA_STATUSES } from '@/lib/ideas/workflow';
import { can } from '@/lib/rbac';
import { formatDate } from '@/lib/utils';
import { VoteButton } from '@/components/ideas/vote-button';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'فكرة' };
export const dynamic = 'force-dynamic';

// /ideas/[id] — عام: المشكلة والحل والحالة واللجنة والأصوات. ملاحظات المراجعة الداخلية لمن يملك ideas:read_internal فقط.
export default async function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await getCurrentUser();

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
      createdAt: true,
      committee: { select: { nameAr: true, slug: true } },
      area: { select: { nameAr: true } },
      mergedInto: { select: { id: true, reference: true, title: true } },
    },
  });
  // المُستلمة قبل الفرز والمدموجة لا تُعرض للعامة؛ المدموجة تُحيل إلى الأصلية
  if (!idea) notFound();
  if (idea.status === 'MERGED' && idea.mergedInto) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 pt-5">
          <p>دُمجت هذه الفكرة في فكرة مشابهة تُراجع معها.</p>
          <Link href={`/ideas/${idea.mergedInto.id}`} className="text-brand hover:underline">
            {idea.mergedInto.title} ({idea.mergedInto.reference})
          </Link>
        </CardContent>
      </Card>
    );
  }
  if (!PUBLIC_IDEA_STATUSES.includes(idea.status)) notFound();

  const modes = await voteModes(user, [idea]);
  const internal = can(user, 'ideas:read_internal', { committeeId: idea.committeeId });

  return (
    <>
      <PageHeader title={idea.title}>
        <StatusBadge kind="idea" status={idea.status} size="md" />
      </PageHeader>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
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
          {internal && idea.reviewNote ? <Alert tone="info">ملاحظة المراجعة (داخلية): {idea.reviewNote}</Alert> : null}
        </div>
        <Card className="h-fit">
          <CardContent className="flex flex-col gap-3 pt-4 text-sm sm:pt-5">
            <VoteButton ideaId={idea.id} count={idea.voteCount} state={modes.get(idea.id) ?? 'closed'} />
            <p>
              <span className="text-muted-foreground">الرقم: </span>
              <span className="font-mono" dir="ltr">
                {idea.reference}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">اللجنة: </span>
              {idea.committee ? (
                <Link href={`/committees/${idea.committee.slug}`} className="text-brand hover:underline">
                  {idea.committee.nameAr}
                </Link>
              ) : (
                'في الفرز الأولي'
              )}
            </p>
            {idea.area ? (
              <p>
                <span className="text-muted-foreground">المنطقة: </span>
                {idea.area.nameAr}
              </p>
            ) : null}
            {idea.estimatedCost ? (
              <p>
                <span className="text-muted-foreground">الكلفة التقديرية: </span>
                {Number(idea.estimatedCost).toLocaleString('ar-PS-u-nu-latn')} ₪
              </p>
            ) : null}
            <p>
              <span className="text-muted-foreground">قُدّمت: </span>
              {formatDate(idea.createdAt)}
            </p>
            <Link href="/ideas" className="text-brand hover:underline">
              كل الأفكار
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
