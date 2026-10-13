import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardPage } from '@/lib/page-guard';
import { formatDate } from '@/lib/utils';
import { IdeaReviewPanel } from '@/components/ideas/review-panel';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';
import { ideaReviewFile } from '@/lib/ideas/queries';

export const metadata: Metadata = { title: 'مراجعة فكرة' };

// /admin/ideas/[id] — ideas:review بنطاق الفكرة (AC-08)
export default async function AdminIdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, allowed, backHref } = await guardPage(`/admin/ideas/${id}`, 'ideas:review');
  if (!allowed) return <Forbidden backHref={backHref} />;
  const file = await ideaReviewFile(user, id);
  // فكرة خارج نطاقه = غير موجودة (رئيس لجنة لا يرى لجنة غيره)
  if (!file) notFound();
  const { idea, actions } = file;

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
