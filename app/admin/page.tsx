import type { Metadata } from 'next';
import Link from 'next/link';
import { complaintTiles } from '@/lib/complaints/queries';
import { navFor } from '@/lib/nav';
import { guardPage } from '@/lib/page-guard';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/states';
import { StatTile } from '@/components/shared/stat-tile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'لوحة المجلس' };

// /admin — «لوحة تتغيّر حسب الدور» (PRD §11.2): كل مؤشر يظهر لمن يملك صلاحيته،
// ويُحسب من السجلات التي يحق له رؤيتها فقط (StatTile §12).
export default async function AdminHome() {
  const { user } = await guardPage('/admin', null);

  const { triage, readable, newCount, reviewing, open, awaitingCommittee, resolved30 } = await complaintTiles(user);

  const settings = navFor(user).find((g) => g.label === 'الإعدادات')?.items ?? [];
  const hasTiles = triage || readable;

  return (
    <>
      <PageHeader title="لوحة المجلس" description={`أهلًا ${user.fullName}. هذه صورة عملك الآن بحسب أدوارك.`} />

      {hasTiles ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {triage ? (
            <>
              <StatTile label="وارد جديد" value={newCount} tone="brand" href="/admin/inbox" meta="بانتظار فتحه للفرز" />
              <StatTile label="قيد الفرز" value={reviewing} href="/admin/inbox" meta="بانتظار اختيار لجنة" />
            </>
          ) : null}
          {readable ? (
            <>
              <StatTile label="شكاوى مفتوحة" value={open} href="/admin/complaints?status=open" />
              <StatTile
                label="محوّلة بانتظار اللجنة"
                value={awaitingCommittee}
                tone="warning"
                href="/admin/complaints?status=ASSIGNED"
              />
              <StatTile label="حُلّت خلال 30 يومًا" value={resolved30} tone="success" href="/admin/complaints?status=RESOLVED" />
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
