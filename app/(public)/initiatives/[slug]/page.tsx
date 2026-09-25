import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { securedByInitiative } from '@/lib/initiatives/queries';
import { formatMoney, PUBLIC_INITIATIVE_STATUSES, SUPPORT_TYPE_LABELS } from '@/lib/initiatives/workflow';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { StatTile } from '@/components/shared/stat-tile';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'مبادرة' };
export const dynamic = 'force-dynamic';

// /initiatives/[slug] — عام: الاحتياجات والشركاء والتحديثات العامة، والمبلغ المؤمَّن من القيود المعتمدة (AC-09 ④).
export default async function InitiativePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const initiative = await db.initiative.findFirst({
    where: { slug, status: { in: PUBLIC_INITIATIVE_STATUSES } },
    select: {
      id: true,
      title: true,
      summary: true,
      description: true,
      status: true,
      progressPct: true,
      estimatedBudget: true,
      beneficiariesTarget: true,
      beneficiariesReached: true,
      impactSummary: true,
      startsAt: true,
      endsAt: true,
      committee: { select: { nameAr: true, slug: true } },
      needs: {
        where: { status: { not: 'CANCELLED' } },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, type: true, description: true, quantity: true, unit: true, amount: true, status: true },
      },
      partners: { orderBy: { since: 'asc' }, select: { role: true, organization: { select: { name: true } } } },
      updates: {
        where: { isPublic: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, body: true, createdAt: true },
      },
    },
  });
  if (!initiative) notFound();
  const secured = Object.entries((await securedByInitiative([initiative.id])).get(initiative.id) ?? {});

  return (
    <>
      <PageHeader title={initiative.title} description={initiative.summary ?? undefined}>
        <StatusBadge kind="initiative" status={initiative.status} size="md" />
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="نسبة الإنجاز" value={initiative.progressPct} meta="٪" tone="brand" />
        <Card className="flex flex-col gap-1 p-4">
          <p className="text-sm text-muted-foreground">المبلغ المؤمَّن</p>
          <p className="text-lg font-semibold text-success">
            {secured.length ? secured.map(([c, v]) => formatMoney(v, c)).join(' + ') : 'لا بيانات بعد'}
          </p>
          {initiative.estimatedBudget ? (
            <p className="text-xs text-muted-foreground">من ميزانية تقديرية {formatMoney(initiative.estimatedBudget, 'ILS')}</p>
          ) : null}
        </Card>
        <StatTile label="المستفيدون المستهدفون" value={initiative.beneficiariesTarget} emptyWhenZero />
        <StatTile label="الشركاء" value={initiative.partners.length} emptyWhenZero />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          {initiative.description ? (
            <Card>
              <CardHeader>
                <CardTitle>عن المبادرة</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-line">{initiative.description}</p>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>الاحتياجات المرقّمة</CardTitle>
            </CardHeader>
            <CardContent>
              {initiative.needs.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا احتياجات مسجّلة.</p>
              ) : (
                <ul className="flex flex-col divide-y text-sm">
                  {initiative.needs.map((n, idx) => (
                    <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <span className="text-muted-foreground">{idx + 1}. </span>
                        {SUPPORT_TYPE_LABELS[n.type]}: {n.description}
                        {n.quantity ? ` — ${n.quantity} ${n.unit ?? ''}` : ''}
                        {n.amount ? ` — ${formatMoney(n.amount, 'ILS')}` : ''}
                      </span>
                      <StatusBadge kind="need" status={n.status} />
                    </li>
                  ))}
                </ul>
              )}
              <Button asChild variant="outline" className="mt-3">
                <Link href="/support">مؤسستكم تستطيع المساعدة؟</Link>
              </Button>
            </CardContent>
          </Card>
          {initiative.updates.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>من الميدان</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {initiative.updates.map((u) => (
                  <div key={u.id} className="text-sm">
                    <p className="text-xs text-muted-foreground">{formatDate(u.createdAt)}</p>
                    <p className="whitespace-pre-line">{u.body}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
        <Card className="h-fit">
          <CardContent className="flex flex-col gap-2 pt-4 text-sm sm:pt-5">
            {initiative.committee ? (
              <p>
                <span className="text-muted-foreground">اللجنة: </span>
                <Link href={`/committees/${initiative.committee.slug}`} className="text-brand hover:underline">
                  {initiative.committee.nameAr}
                </Link>
              </p>
            ) : null}
            {initiative.startsAt ? (
              <p>
                <span className="text-muted-foreground">المدة: </span>
                {formatDate(initiative.startsAt)}
                {initiative.endsAt ? ` — ${formatDate(initiative.endsAt)}` : ''}
              </p>
            ) : null}
            <div>
              <p className="text-muted-foreground">الشركاء</p>
              {initiative.partners.length === 0 ? (
                <p>لا شركاء بعد.</p>
              ) : (
                <ul className="mt-1 list-disc ps-4">
                  {initiative.partners.map((p) => (
                    <li key={p.organization.name}>
                      {p.organization.name} <span className="text-xs text-muted-foreground">({p.role})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {initiative.impactSummary ? (
              <p>
                <span className="text-muted-foreground">الأثر: </span>
                {initiative.impactSummary}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
