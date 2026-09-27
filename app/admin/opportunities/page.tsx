import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { OPPORTUNITY_TYPE_LABELS, publishBlocker } from '@/lib/opportunities/workflow';
import { listApplicants } from '@/lib/opportunities/queries';
import { guardPage } from '@/lib/page-guard';
import { formatDate } from '@/lib/utils';
import { closeOpportunityAction, reviewOpportunityAction } from '@/server/actions/opportunities';
import { ApplicantPanel } from '@/components/opportunities/applicant-panel';
import { ActionButtons } from '@/components/shared/action-buttons';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Alert, Card } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'مراجعة الفرص' };

// /admin/opportunities — opportunities:publish: مراجعة ما أرسلته المؤسسات ونشره (سطر opportunity.publish).
// المتقدّمون لمن يملك opportunities:applicants أيضًا — بنفس قاعدة الموافقة (D31).
export default async function AdminOpportunitiesPage() {
  const { user, allowed, backHref } = await guardPage('/admin/opportunities', 'opportunities:publish');
  if (!allowed) return <Forbidden backHref={backHref} />;

  const select = {
    id: true,
    title: true,
    description: true,
    type: true,
    applyMode: true,
    externalUrl: true,
    status: true,
    deadline: true,
    seats: true,
    createdAt: true,
    publishedAt: true,
    organizationId: true,
    organization: { select: { name: true } },
    createdBy: { select: { fullName: true } },
    skills: { select: { skill: { select: { nameAr: true } } } },
    _count: { select: { applications: true } },
  } as const;
  const [pending, others] = await Promise.all([
    db.opportunity.findMany({ where: { status: 'PENDING_REVIEW' }, orderBy: { createdAt: 'asc' }, select }),
    db.opportunity.findMany({ where: { status: { not: 'PENDING_REVIEW' } }, orderBy: { updatedAt: 'desc' }, take: 100, select }),
  ]);
  const applicants = await listApplicants(db, user, others);

  return (
    <>
      <PageHeader title="مراجعة الفرص" description="الفرص الواردة من المؤسسات لا تظهر للشباب قبل نشرها هنا. تأكد من وضوح الشروط ومن رابط الجهة الرسمي." />
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">بانتظار المراجعة ({pending.length})</h2>
        {pending.length === 0 ? (
          <Card>
            <EmptyState title="لا فرص بانتظار المراجعة" hint="حين ترسل مؤسسة شريكة فرصة تظهر هنا لتنشرها أو ترفضها." />
          </Card>
        ) : (
          pending.map((o) => {
            const expired = publishBlocker(o);
            return (
              <Card key={o.id} className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="flex flex-col gap-0.5">
                    <span className="font-semibold">{o.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {OPPORTUNITY_TYPE_LABELS[o.type]} · {o.organization?.name} · أرسلها {o.createdBy.fullName} · {formatDate(o.createdAt)}
                    </span>
                  </span>
                  <StatusBadge kind="opportunity" status={o.status} />
                </div>
                <p className="text-sm whitespace-pre-line">{o.description}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">التقديم</dt>
                  <dd>
                    {o.applyMode === 'EXTERNAL' ? (
                      <a href={o.externalUrl ?? '#'} target="_blank" rel="noopener noreferrer nofollow" dir="ltr" className="break-all text-brand hover:underline">
                        {o.externalUrl}
                      </a>
                    ) : (
                      'داخل المنصة'
                    )}
                  </dd>
                  <dt className="text-muted-foreground">آخر موعد</dt>
                  <dd>{o.deadline ? formatDate(o.deadline) : 'بلا موعد'}</dd>
                  {o.seats ? (
                    <>
                      <dt className="text-muted-foreground">المقاعد</dt>
                      <dd>{o.seats}</dd>
                    </>
                  ) : null}
                  {o.skills.length ? (
                    <>
                      <dt className="text-muted-foreground">المهارات</dt>
                      <dd>{o.skills.map((s) => s.skill.nameAr).join('، ')}</dd>
                    </>
                  ) : null}
                </dl>
                {expired ? <Alert tone="warning">{expired}</Alert> : null}
                <ActionButtons
                  items={[
                    // فرصة مضى موعدها: الرفض وحده (الخادم يرفض النشر على أي حال)
                    ...(expired
                      ? []
                      : [
                          {
                            action: reviewOpportunityAction,
                            fields: { opportunityId: o.id, decision: 'PUBLISHED' },
                            label: 'نشر الفرصة',
                            variant: 'default' as const,
                          },
                        ]),
                    { action: reviewOpportunityAction, fields: { opportunityId: o.id, decision: 'REJECTED' }, label: 'رفض' },
                  ]}
                />
              </Card>
            );
          })
        )}
      </section>

      <section className="mt-6 flex flex-col gap-3">
        <h2 className="font-semibold">كل الفرص</h2>
        {others.length === 0 ? (
          <Card>
            <EmptyState title="لا فرص مراجَعة بعد" hint="الفرص التي تنشرها أو ترفضها تظهر هنا بحالتها وعدد المتقدّمين." />
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {others.map((o) => {
              const rows = applicants.get(o.id);
              return (
                <li key={o.id}>
                  <Card className="flex flex-col gap-2 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="flex flex-col">
                        {o.status === 'PUBLISHED' || o.status === 'CLOSED' ? (
                          <Link href={`/opportunities/${o.id}`} className="font-medium text-brand hover:underline">
                            {o.title}
                          </Link>
                        ) : (
                          <span className="font-medium">{o.title}</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {o.organization?.name} · {o.applyMode === 'EXTERNAL' ? 'رابط خارجي' : `${o._count.applications} متقدّم`}
                          {o.publishedAt ? ` · نُشرت ${formatDate(o.publishedAt)}` : ''}
                        </span>
                      </span>
                      <StatusBadge kind="opportunity" status={o.status} />
                    </div>
                    {o.status === 'PUBLISHED' ? (
                      <ActionButtons items={[{ action: closeOpportunityAction, fields: { opportunityId: o.id }, label: 'إغلاق' }]} />
                    ) : null}
                    {rows && rows.length > 0 ? (
                      <details>
                        <summary className="cursor-pointer text-sm text-brand">المتقدّمون ({rows.length})</summary>
                        <div className="mt-2">
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
      </section>
    </>
  );
}
