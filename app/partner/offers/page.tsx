import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { formatMoney, SUPPORT_TYPE_LABELS } from '@/lib/initiatives/workflow';
import { memberOrganizationIds } from '@/lib/organizations';
import { guardPage } from '@/lib/page-guard';
import { scopeFilter } from '@/lib/rbac';
import { formatDate } from '@/lib/utils';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';

export const metadata: Metadata = { title: 'عروض دعمنا' };

// /partner/offers — offers:read («خاص» = عروض مؤسسات المستخدم — D27). لا ترى المؤسسة عروض غيرها.
export default async function PartnerOffersPage() {
  const { user, allowed, backHref } = await guardPage('/partner/offers', 'offers:read');
  if (!allowed) return <Forbidden backHref={backHref} />;
  const scope = scopeFilter(user, 'offers:read');
  const orgIds = await memberOrganizationIds(db, user.id);
  // حتى من يملك نطاقًا أوسع يرى هنا عروض مؤسساته فقط: هذه بوابته هو
  const offers = await db.supportOffer.findMany({
    where: { organizationId: { in: scope ? orgIds : [] } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      types: true,
      amount: true,
      currency: true,
      status: true,
      decisionNote: true,
      createdAt: true,
      organization: { select: { name: true } },
      initiative: { select: { slug: true, title: true } },
      need: { select: { description: true } },
    },
  });

  return (
    <>
      <PageHeader title="عروض دعمنا" description="كل عروض مؤسستكم وقرار المجلس عليها. العرض المالي المقبول يُسجَّل قيده عند وصول المبلغ." />
      <DataTable
        rows={offers}
        rowKey={(o) => o.id}
        empty={{ title: 'لم تقدّموا عرضًا بعد', hint: 'تصفّح الاحتياجات المفتوحة واختر ما تستطيعون تغطيته.' }}
        columns={[
          {
            key: 'initiative',
            header: 'المبادرة',
            cell: (o) => (
              <span className="flex flex-col">
                <Link href={`/initiatives/${o.initiative.slug}`} className="font-medium text-brand hover:underline">
                  {o.initiative.title}
                </Link>
                <span className="text-xs text-muted-foreground">{o.need?.description ?? 'دعم عام للمبادرة'}</span>
              </span>
            ),
          },
          {
            key: 'what',
            header: 'الدعم',
            cell: (o) => (
              <span className="flex flex-col">
                <span>{o.types.map((t) => SUPPORT_TYPE_LABELS[t]).join('، ')}</span>
                {o.amount ? <span className="text-xs text-muted-foreground">{formatMoney(o.amount, o.currency)}</span> : null}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'القرار',
            cell: (o) => (
              <span className="flex flex-col gap-1">
                <StatusBadge kind="offer" status={o.status} />
                {o.decisionNote ? <span className="text-xs text-muted-foreground">{o.decisionNote}</span> : null}
              </span>
            ),
          },
          { key: 'org', header: 'المؤسسة', className: 'hidden md:table-cell', cell: (o) => o.organization.name },
          { key: 'date', header: 'أُرسل', className: 'hidden sm:table-cell', cell: (o) => formatDate(o.createdAt) },
        ]}
      />
    </>
  );
}
