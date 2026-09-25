import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { PUBLIC_IDEA_STATUSES } from '@/lib/ideas/workflow';
import { guardPage } from '@/lib/page-guard';
import { formatDate } from '@/lib/utils';
import { ReviseIdeaForm } from '@/components/ideas/revise-form';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'أفكاري' };

// /me/ideas — ideas:create. ما قدّمه المستخدم نفسه؛ ملاحظة المراجع تصله حين تخصّه: طلب تعديل أو رفض.
export default async function MyIdeasPage() {
  const { user, allowed, backHref } = await guardPage('/me/ideas', 'ideas:create');
  if (!allowed) return <Forbidden backHref={backHref} />;

  const ideas = await db.idea.findMany({
    where: { submitterId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      reference: true,
      title: true,
      problem: true,
      solution: true,
      estimatedCost: true,
      status: true,
      voteCount: true,
      reviewNote: true,
      createdAt: true,
      committee: { select: { nameAr: true } },
      mergedInto: { select: { id: true, reference: true } },
    },
  });

  return (
    <>
      <PageHeader title="أفكاري" description="أفكارك بحالتها. تظهر للعامة ويُصوَّت عليها بعد الفرز الأولي.">
        <Button asChild>
          <Link href="/me/ideas/new">قدّم فكرة</Link>
        </Button>
      </PageHeader>
      {ideas.length === 0 ? (
        <Card>
          <EmptyState
            title="لم تقدّم فكرة بعد"
            hint="عندك فكرة تحلّ مشكلة في حيّك؟ صف المشكلة والحل والكلفة، وتصل أمانة السر ثم اللجنة المختصة."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {ideas.map((i) => (
            <li key={i.id}>
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    {PUBLIC_IDEA_STATUSES.includes(i.status) ? (
                      <Link href={`/ideas/${i.id}`} className="font-semibold text-brand hover:underline">
                        {i.title}
                      </Link>
                    ) : (
                      <span className="font-semibold">{i.title}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      <span className="font-mono" dir="ltr">
                        {i.reference}
                      </span>{' '}
                      · {formatDate(i.createdAt)} · {i.voteCount} صوت · {i.committee?.nameAr ?? 'قبل الإحالة للجنة'}
                    </span>
                  </div>
                  <StatusBadge kind="idea" status={i.status} />
                </div>
                {i.status === 'SUBMITTED' ? (
                  <p className="text-sm text-muted-foreground">تنتظر الفرز الأولي من أمانة السر قبل نشرها للتصويت.</p>
                ) : null}
                {i.status === 'MERGED' && i.mergedInto ? (
                  <Alert tone="info">
                    دُمجت في فكرة مشابهة:{' '}
                    <Link href={`/ideas/${i.mergedInto.id}`} className="underline">
                      {i.mergedInto.reference}
                    </Link>
                  </Alert>
                ) : null}
                {(i.status === 'CHANGES_REQUESTED' || i.status === 'REJECTED') && i.reviewNote ? (
                  <Alert tone={i.status === 'REJECTED' ? 'danger' : 'warning'}>
                    {i.status === 'REJECTED' ? 'سبب القرار: ' : 'المطلوب تعديله: '}
                    {i.reviewNote}
                  </Alert>
                ) : null}
                {i.status === 'CHANGES_REQUESTED' ? (
                  <details open>
                    <summary className="cursor-pointer text-sm font-medium text-brand">عدّل فكرتك وأعد إرسالها</summary>
                    <div className="mt-3">
                      <ReviseIdeaForm
                        idea={{
                          id: i.id,
                          title: i.title,
                          problem: i.problem,
                          solution: i.solution,
                          estimatedCost: i.estimatedCost?.toString() ?? null,
                        }}
                      />
                    </div>
                  </details>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
