import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import { VoteButton } from '@/components/ideas/vote-button';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';
import { publicIdea } from '@/lib/ideas/queries';

export const metadata: Metadata = { title: 'فكرة' };
export const dynamic = 'force-dynamic';

// /ideas/[id] — عام: المشكلة والحل والحالة واللجنة والأصوات. ملاحظات المراجعة الداخلية لمن يملك ideas:read_internal فقط.
export default async function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();

  const found = await publicIdea(user, id);
  // المُستلمة قبل الفرز غير موجودة للعامة؛ المدموجة تُحيل إلى الأصلية
  if (!found) notFound();
  if (found.kind === 'merged') {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 pt-5">
          <p>دُمجت هذه الفكرة في فكرة مشابهة تُراجع معها.</p>
          <Link href={`/ideas/${found.mergedInto.id}`} className="text-brand hover:underline">
            {found.mergedInto.title} ({found.mergedInto.reference})
          </Link>
        </CardContent>
      </Card>
    );
  }
  const { idea, voteMode, internal } = found;

  return (
    <>
      <PageHeader title={idea.title}>
        <StatusBadge kind="idea" status={idea.status} size="md" />
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
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
            <VoteButton ideaId={idea.id} count={idea.voteCount} state={voteMode} />
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
