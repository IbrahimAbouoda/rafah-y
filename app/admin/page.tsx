import type { Metadata } from 'next';
import Link from 'next/link';
import { CircleCheck, FolderOpen, Hourglass, Inbox, ListFilter } from 'lucide-react';
import { readableComplaints } from '@/lib/complaints/queries';
import { OPEN_STATUSES } from '@/lib/complaints/workflow';
import { db } from '@/lib/db';
import { navFor } from '@/lib/nav';
import { guardPage } from '@/lib/page-guard';
import { can, canBeyondOwn } from '@/lib/rbac';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/states';
import { StatTile } from '@/components/shared/stat-tile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'لوحة المجلس' };

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

// /admin — «لوحة تتغيّر حسب الدور» (PRD §11.2): كل مؤشر يظهر لمن يملك صلاحيته،
// ويُحسب من السجلات التي يحق له رؤيتها فقط (StatTile §12).
export default async function AdminHome() {
  const { user } = await guardPage('/admin', null);

  const triage = can(user, 'complaints:triage');
  const readScope = canBeyondOwn(user, 'complaints:read') ? readableComplaints(user) : null;
  const monthAgo = daysAgo(30);

  const count = (where: object) => db.complaint.count({ where }).catch(() => null);
  const [newCount, reviewing, open, awaitingCommittee, resolved30] = await Promise.all([
    triage ? count({ status: 'SUBMITTED' }) : null,
    triage ? count({ status: 'UNDER_REVIEW' }) : null,
    readScope ? count({ AND: [readScope, { status: { in: OPEN_STATUSES } }] }) : null,
    readScope ? count({ AND: [readScope, { status: 'ASSIGNED' }] }) : null,
    readScope ? count({ AND: [readScope, { status: { in: ['RESOLVED', 'CLOSED'] }, updatedAt: { gte: monthAgo } }] }) : null,
  ]);

  const settings = navFor(user).find((g) => g.label === 'الإعدادات')?.items ?? [];
  const hasTiles = triage || readScope;

  return (
    <>
      <PageHeader title="لوحة المجلس" description={`أهلًا ${user.fullName}. هذه صورة عملك الآن بحسب أدوارك.`} />

      {hasTiles ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {triage ? (
            <>
              <StatTile label="وارد جديد" value={newCount} tone="brand" icon={Inbox} href="/admin/inbox" meta="بانتظار فتحه للفرز" />
              <StatTile label="قيد الفرز" value={reviewing} icon={ListFilter} href="/admin/inbox" meta="بانتظار اختيار لجنة" />
            </>
          ) : null}
          {readScope ? (
            <>
              <StatTile label="شكاوى مفتوحة" value={open} icon={FolderOpen} href="/admin/complaints?status=open" />
              <StatTile
                label="محوّلة بانتظار اللجنة"
                value={awaitingCommittee}
                tone="warning"
                icon={Hourglass}
                href="/admin/complaints?status=ASSIGNED"
              />
              <StatTile label="حُلّت خلال 30 يومًا" value={resolved30} tone="success" icon={CircleCheck} href="/admin/complaints?status=RESOLVED" />
            </>
          ) : null}
        </div>
      ) : null}

      {settings.length > 0 ? (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle>الإعدادات</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {settings.map((i) => (
              <Link key={i.href} href={i.href} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                {i.label}
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {!hasTiles && settings.length === 0 ? (
        <Card>
          <EmptyState
            title="لا مهام لدورك في هذه المرحلة"
            hint="لوحات اللجان والمهام تُفتح في المرحلة القادمة. إن كنت تتوقع رؤية الشكاوى هنا، اطلب من رئيس المجلس مراجعة دورك."
          />
        </Card>
      ) : null}
    </>
  );
}
