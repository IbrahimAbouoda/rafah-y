import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { guardPage } from '@/lib/page-guard';
import { formatDate } from '@/lib/utils';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surface';
import { StartTermForm } from './start-term-form';

export const metadata: Metadata = { title: 'دورات المجلس' };

export default async function TermsPage() {
  const { allowed, backHref } = await guardPage('/admin/settings/terms', 'users:manage_roles');
  if (!allowed) return <Forbidden backHref={backHref} />;

  const terms = await db.councilTerm.findMany({
    orderBy: { startsAt: 'desc' },
    select: { id: true, name: true, startsAt: true, endsAt: true, isCurrent: true, _count: { select: { assignments: true } } },
  });

  return (
    <>
      <PageHeader
        title="دورات المجلس"
        description="دورة حالية واحدة فقط. بدء دورة جديدة يوقف أدوار المجلس واللجان في الدورة السابقة دون حذف أي بيان، فتبقى ذاكرة المجلس كاملة."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <DataTable
          rows={terms}
          rowKey={(t) => t.id}
          empty={{ title: 'لا دورات بعد', hint: 'ابدأ الدورة الحالية من النموذج، ثم عيّن أعضاء المجلس واللجان.' }}
          columns={[
            { key: 'name', header: 'الدورة', cell: (t) => <span className="font-medium">{t.name}</span> },
            { key: 'status', header: 'الحالة', cell: (t) => <StatusBadge kind="term" status={t.isCurrent ? 'current' : 'past'} /> },
            { key: 'start', header: 'البداية', cell: (t) => formatDate(t.startsAt) },
            { key: 'end', header: 'النهاية', cell: (t) => formatDate(t.endsAt) },
            { key: 'count', header: 'التعيينات', cell: (t) => t._count.assignments, className: 'hidden sm:table-cell' },
          ]}
        />
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>بدء دورة جديدة</CardTitle>
            <CardDescription>تصبح الحالية فورًا، وتُغلق الدورة الحالية إن وُجدت.</CardDescription>
          </CardHeader>
          <CardContent>
            <StartTermForm hasCurrent={terms.some((t) => t.isCurrent)} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
