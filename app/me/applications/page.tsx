import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { OPPORTUNITY_TYPE_LABELS, WITHDRAWABLE_APPLICATION_STATUSES } from '@/lib/opportunities/workflow';
import { guardPage } from '@/lib/page-guard';
import { formatDate } from '@/lib/utils';
import { withdrawApplicationAction } from '@/server/actions/opportunities';
import { ActionButtons } from '@/components/shared/action-buttons';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'طلباتي على الفرص' };

// /me/applications — opportunities:apply («خاص»): طلبات المستخدم نفسه وحالتها وموافقة كل منها
export default async function MyApplicationsPage() {
  const { user, allowed, backHref } = await guardPage('/me/applications', 'opportunities:apply');
  if (!allowed) return <Forbidden backHref={backHref} />;

  const applications = await db.opportunityApplication.findMany({
    where: { applicantId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      shareProfile: true,
      createdAt: true,
      opportunity: { select: { id: true, title: true, type: true, status: true, organization: { select: { name: true } } } },
    },
  });

  return (
    <>
      <PageHeader title="طلباتي على الفرص" description="كل طلب بحالته، وهل شاركت فيه ملفك. تصلك الإشعارات حين تتغيّر الحالة.">
        <Button asChild variant="outline">
          <Link href="/opportunities">تصفّح الفرص</Link>
        </Button>
      </PageHeader>
      {applications.length === 0 ? (
        <Card>
          <EmptyState title="لم تتقدّم لفرصة بعد" hint="تصفّح بوابة الفرص واختر ما يناسبك. أكمل ملفك ومهاراتك أولًا لتكون فرصتك أفضل.">
            <Link href="/me/profile" className="text-sm text-brand hover:underline">
              أكمل ملفي
            </Link>
          </EmptyState>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {applications.map((a) => (
            <li key={a.id}>
              <Card className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="flex flex-col gap-0.5">
                    {a.opportunity.status === 'PUBLISHED' || a.opportunity.status === 'CLOSED' ? (
                      <Link href={`/opportunities/${a.opportunity.id}`} className="font-semibold text-brand hover:underline">
                        {a.opportunity.title}
                      </Link>
                    ) : (
                      <span className="font-semibold">{a.opportunity.title}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {OPPORTUNITY_TYPE_LABELS[a.opportunity.type]} · {a.opportunity.organization?.name ?? 'المجلس'} · قُدّم{' '}
                      {formatDate(a.createdAt)}
                    </span>
                  </span>
                  <StatusBadge kind="application" status={a.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {a.shareProfile
                    ? 'شاركت ملفك مع الجهة في هذا الطلب. سحب موافقتك العامة من ملفك لا يلغي هذا الطلب.'
                    : 'لم تشارك ملفك: ترى الجهة أن أحدًا تقدّم دون أي بيانات عنك.'}
                </p>
                {WITHDRAWABLE_APPLICATION_STATUSES.includes(a.status) ? (
                  <ActionButtons items={[{ action: withdrawApplicationAction, fields: { applicationId: a.id }, label: 'سحب الطلب' }]} />
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
