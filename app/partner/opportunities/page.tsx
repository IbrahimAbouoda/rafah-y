import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { OPPORTUNITY_TYPE_LABELS } from '@/lib/opportunities/workflow';
import { listApplicants } from '@/lib/opportunities/queries';
import { memberOrganizationIds } from '@/lib/organizations';
import { guardPage } from '@/lib/page-guard';
import { formatDate } from '@/lib/utils';
import { closeOpportunityAction } from '@/server/actions/opportunities';
import { ApplicantPanel } from '@/components/opportunities/applicant-panel';
import { ActionButtons } from '@/components/shared/action-buttons';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'فرصنا' };

// /partner/opportunities — opportunities:create («خاص» = فرص مؤسسات المستخدم — D27)
// المتقدّمون بـ opportunities:applicants: بلا بيانات شخصية في القائمة، والملف يُطلب صراحةً لكل طلب (D31)
export default async function PartnerOpportunitiesPage() {
  const { user, allowed, backHref } = await guardPage('/partner/opportunities', 'opportunities:create');
  if (!allowed) return <Forbidden backHref={backHref} />;
  const orgIds = await memberOrganizationIds(db, user.id);
  const opportunities = await db.opportunity.findMany({
    where: { organizationId: { in: orgIds } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      type: true,
      applyMode: true,
      status: true,
      deadline: true,
      createdAt: true,
      organizationId: true,
      organization: { select: { name: true } },
    },
  });
  const applicants = await listApplicants(db, user, opportunities);

  return (
    <>
      <PageHeader title="فرصنا" description="الفرص التي أرسلتموها وحالة مراجعتها، والمتقدّمون عليها بموافقتهم.">
        {orgIds.length > 0 ? (
          <Button asChild>
            <Link href="/partner/opportunities/new">
              <Plus aria-hidden />
              فرصة جديدة
            </Link>
          </Button>
        ) : null}
      </PageHeader>
      {orgIds.length === 0 ? (
        <Card>
          <EmptyState title="حسابك غير مربوط بمؤسسة" hint="لا تُنشر فرصة إلا باسم مؤسسة. تواصل مع أمانة السر ليربط المجلس حسابك." />
        </Card>
      ) : opportunities.length === 0 ? (
        <Card>
          <EmptyState title="لم تنشروا فرصة بعد" hint="أرسلوا فرصة عمل أو تدريب أو منحة؛ تراجعها أمانة السر ثم تظهر للشباب في بوابة الفرص.">
            <Link href="/partner/opportunities/new" className="text-sm text-brand hover:underline">
              أرسلوا أول فرصة
            </Link>
          </EmptyState>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {opportunities.map((o) => {
            const rows = applicants.get(o.id);
            return (
              <li key={o.id}>
                <Card className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="flex flex-col gap-0.5">
                      {o.status === 'PUBLISHED' || o.status === 'CLOSED' ? (
                        <Link href={`/opportunities/${o.id}`} className="font-semibold text-brand hover:underline">
                          {o.title}
                        </Link>
                      ) : (
                        <span className="font-semibold">{o.title}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {OPPORTUNITY_TYPE_LABELS[o.type]} · {o.organization?.name} · أُرسلت {formatDate(o.createdAt)}
                        {o.deadline ? ` · آخر موعد ${formatDate(o.deadline)}` : ''}
                      </span>
                    </span>
                    <StatusBadge kind="opportunity" status={o.status} />
                  </div>
                  {o.status === 'PENDING_REVIEW' ? (
                    <p className="text-sm text-muted-foreground">تراجعها أمانة السر الآن، ويصلكم إشعار عند نشرها.</p>
                  ) : o.status === 'REJECTED' ? (
                    <p className="text-sm text-muted-foreground">لم تُنشر. للاستفسار عن السبب تواصلوا مع أمانة السر.</p>
                  ) : null}
                  {o.status === 'PUBLISHED' ? (
                    <ActionButtons items={[{ action: closeOpportunityAction, fields: { opportunityId: o.id }, label: 'إغلاق الفرصة' }]} />
                  ) : null}
                  {o.applyMode === 'EXTERNAL' ? (
                    <p className="text-xs text-muted-foreground">التقديم عبر رابطكم الخارجي، فلا طلبات هنا.</p>
                  ) : rows && (o.status === 'PUBLISHED' || o.status === 'CLOSED') ? (
                    <details open={rows.length > 0}>
                      <summary className="cursor-pointer text-sm font-medium text-brand">المتقدّمون ({rows.length})</summary>
                      <div className="mt-3">
                        <ApplicantPanel applicants={rows} />
                      </div>
                    </details>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
