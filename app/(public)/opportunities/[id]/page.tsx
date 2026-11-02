import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { applyBlocker, OPPORTUNITY_TYPE_LABELS } from '@/lib/opportunities/workflow';
import { can } from '@/lib/rbac';
import { formatDate } from '@/lib/utils';
import { ApplyForm } from '@/components/opportunities/apply-form';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';
import { COUNCIL_NAME_AR } from '@/lib/config';

export const metadata: Metadata = { title: 'فرصة' };
export const dynamic = 'force-dynamic';

// /opportunities/[id] — التفاصيل عامة، والتقديم بـ opportunities:apply (يُفحص في الخادم عند الإرسال).
// الفرصة الخارجية تعرض رابط الجهة ولا تتلقى طلبًا هنا (§5.4). غير المنشورة غير موجودة للعامة.
export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await getCurrentUser();

  const o = await db.opportunity.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      applyMode: true,
      externalUrl: true,
      seats: true,
      deadline: true,
      status: true,
      publishedAt: true,
      isDemo: true,
      organization: { select: { name: true } },
      area: { select: { nameAr: true } },
      skills: { select: { skill: { select: { nameAr: true } } } },
    },
  });
  if (!o || (o.status !== 'PUBLISHED' && o.status !== 'CLOSED')) notFound();

  const canApply = can(user, 'opportunities:apply');
  const mine =
    user && canApply
      ? await db.opportunityApplication.findUnique({
          where: { opportunityId_applicantId: { opportunityId: o.id, applicantId: user.id } },
          select: { status: true, shareProfile: true },
        })
      : null;
  const blocker = applyBlocker(o);
  const recipient = o.organization?.name ?? COUNCIL_NAME_AR;

  return (
    <>
      <PageHeader title={o.title}>
        <StatusBadge kind="opportunity" status={o.status} size="md" />
      </PageHeader>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          {o.isDemo ? <Alert tone="warning">فرصة عرض تجريبية — ليست حقيقية.</Alert> : null}
          <Card>
            <CardHeader>
              <CardTitle>عن الفرصة</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-line">{o.description}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>التقديم</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {o.applyMode === 'EXTERNAL' ? (
                <>
                  <p className="text-sm">
                    تدير {recipient} التقديم على هذه الفرصة بنفسها عبر رابطها الرسمي. لا يُرسل أي طلب أو بيانات عبر المنصة.
                  </p>
                  {o.externalUrl && o.status === 'PUBLISHED' ? (
                    <Button asChild variant="outline" className="self-start">
                      <a href={o.externalUrl} target="_blank" rel="noopener noreferrer nofollow">
                        <ExternalLink aria-hidden />
                        رابط التقديم الرسمي
                      </a>
                    </Button>
                  ) : null}
                </>
              ) : mine ? (
                <Alert tone="info">
                  قدّمت على هذه الفرصة {mine.shareProfile ? 'مع مشاركة ملفك' : 'دون مشاركة ملفك'}. حالة طلبك:{' '}
                  <StatusBadge kind="application" status={mine.status} />{' '}
                  <Link href="/me/applications" className="underline">
                    طلباتي
                  </Link>
                </Alert>
              ) : blocker ? (
                <p className="text-sm text-muted-foreground">{blocker}</p>
              ) : !user ? (
                <p className="text-sm">
                  <Link href={`/login?next=/opportunities/${o.id}`} className="text-brand hover:underline">
                    سجّل الدخول
                  </Link>{' '}
                  أو{' '}
                  <Link href="/register" className="text-brand hover:underline">
                    أنشئ حسابًا
                  </Link>{' '}
                  لتتقدّم لهذه الفرصة.
                </p>
              ) : canApply ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    يُطلب منك قبل الإرسال قرار صريح: هل تشارك ملفك مع {recipient}؟ ملف أكمل يعني فرصة أفضل —{' '}
                    <Link href="/me/profile" className="text-brand hover:underline">
                      راجع ملفي
                    </Link>
                  </p>
                  <ApplyForm opportunityId={o.id} recipient={recipient} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">التقديم على الفرص متاح لحسابات الشباب.</p>
              )}
            </CardContent>
          </Card>
        </div>
        <Card className="h-fit">
          <CardContent className="flex flex-col gap-2 pt-4 text-sm sm:pt-5">
            <p>
              <span className="text-muted-foreground">الجهة: </span>
              {recipient}
            </p>
            <p>
              <span className="text-muted-foreground">النوع: </span>
              {OPPORTUNITY_TYPE_LABELS[o.type]}
            </p>
            {o.area ? (
              <p>
                <span className="text-muted-foreground">المنطقة: </span>
                {o.area.nameAr}
              </p>
            ) : null}
            {o.seats ? (
              <p>
                <span className="text-muted-foreground">المقاعد: </span>
                {o.seats}
              </p>
            ) : null}
            <p>
              <span className="text-muted-foreground">آخر موعد: </span>
              {o.deadline ? formatDate(o.deadline) : 'بلا موعد نهائي'}
            </p>
            {o.skills.length ? (
              <p>
                <span className="text-muted-foreground">المهارات: </span>
                {o.skills.map((s) => s.skill.nameAr).join('، ')}
              </p>
            ) : null}
            <p>
              <span className="text-muted-foreground">نُشرت: </span>
              {formatDate(o.publishedAt)}
            </p>
            <Link href="/opportunities" className="text-brand hover:underline">
              كل الفرص
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
