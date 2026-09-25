import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { formatMoney, OFFERABLE_INITIATIVE_STATUSES, OPEN_NEED_STATUSES, SUPPORT_TYPE_LABELS } from '@/lib/initiatives/workflow';
import { memberOrganizationIds } from '@/lib/organizations';
import { guardPage } from '@/lib/page-guard';
import { OfferForm } from '@/components/initiatives/offer-form';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'الاحتياجات المفتوحة' };

// /partner/needs — offers:create. المغطّى لا يظهر (AC-09 ③)، والمبادرة غير المعتمدة لا تظهر.
export default async function PartnerNeedsPage() {
  const { user, allowed, backHref } = await guardPage('/partner/needs', 'offers:create');
  if (!allowed) return <Forbidden backHref={backHref} />;
  const orgIds = await memberOrganizationIds(db, user.id);
  const [orgs, initiatives] = await Promise.all([
    db.organization.findMany({ where: { id: { in: orgIds } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.initiative.findMany({
      where: { status: { in: OFFERABLE_INITIATIVE_STATUSES }, needs: { some: { status: { in: OPEN_NEED_STATUSES } } } },
      orderBy: [{ isFlagship: 'desc' }, { approvedAt: 'desc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        committee: { select: { nameAr: true } },
        needs: {
          where: { status: { in: OPEN_NEED_STATUSES } },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, type: true, description: true, quantity: true, unit: true, amount: true, status: true },
        },
      },
    }),
  ]);

  return (
    <>
      <PageHeader title="الاحتياجات المفتوحة" description="اختر احتياجًا تستطيع تغطيته وأرسل عرضك. الدعم غير المالي بمكانة المالي تمامًا." />
      {orgs.length === 0 ? (
        <Card>
          <EmptyState title="حسابك غير مربوط بمؤسسة" hint="لا يُرسل عرض إلا باسم مؤسسة. تواصل مع أمانة السر ليربط المجلس حسابك." />
        </Card>
      ) : initiatives.length === 0 ? (
        <Card>
          <EmptyState title="لا احتياجات مفتوحة الآن" hint="حين يعتمد المجلس مبادرة جديدة باحتياجاتها تظهر هنا، ويمكنك متابعة «ادعمنا»." />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {initiatives.map((i) => (
            <Card key={i.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/initiatives/${i.slug}`} className="font-semibold text-brand hover:underline">
                  {i.title}
                </Link>
                <span className="text-xs text-muted-foreground">{i.committee?.nameAr}</span>
              </div>
              {i.summary ? <p className="text-sm text-muted-foreground">{i.summary}</p> : null}
              <ul className="flex flex-col divide-y rounded-lg border">
                {i.needs.map((n) => (
                  <li key={n.id} className="flex flex-col gap-2 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="flex flex-col">
                        <span className="font-medium">
                          {SUPPORT_TYPE_LABELS[n.type]}: {n.description}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {n.quantity ? `${n.quantity} ${n.unit ?? ''}` : ''}
                          {n.amount ? ` · ${formatMoney(n.amount, 'ILS')}` : ''}
                        </span>
                      </span>
                      <StatusBadge kind="need" status={n.status} />
                    </div>
                    <details>
                      <summary className="cursor-pointer text-sm text-brand">قدّم عرضًا لهذا الاحتياج</summary>
                      <div className="mt-3">
                        <OfferForm initiativeId={i.id} need={{ id: n.id, type: n.type }} organizations={orgs} />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
