import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { guardPage } from '@/lib/page-guard';
import { can } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'صندوق الوارد' };

const PAGE_SIZE = 25;

// /admin/inbox — D4: complaints:triage أو ideas:review أو offers:decide، وكل مستخدم يرى القسم الذي يملكه فقط.
// Sprint 1: قسم الشكاوى. قسما الأفكار (Sprint 2) والعروض (Sprint 3) يُضافان هنا.
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const { user, allowed, backHref } = await guardPage('/admin/inbox', [
    'complaints:triage',
    'ideas:review',
    'offers:decide',
  ]);
  if (!allowed) return <Forbidden backHref={backHref} />;

  if (!can(user, 'complaints:triage')) {
    return (
      <>
        <PageHeader title="صندوق الوارد" />
        <Card>
          <EmptyState
            title="لا قسم لك في الوارد بعد"
            hint="قسما الأفكار وعروض الدعم يُفتحان في المراحل القادمة. الشكاوى المحوّلة للجنتك تجدها في «الشكاوى»."
          />
        </Card>
      </>
    );
  }

  const page = Math.max(1, Number(params.page) || 1);
  const where = { status: { in: ['SUBMITTED' as const, 'UNDER_REVIEW' as const] } };
  const [rows, total] = await Promise.all([
    db.complaint.findMany({
      where,
      // الأقدم أولًا: لا تنتظر شكوى أطول من غيرها
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        reference: true,
        title: true,
        status: true,
        createdAt: true,
        category: { select: { nameAr: true, defaultCommittee: { select: { nameAr: true } } } },
        area: { select: { nameAr: true } },
      },
    }),
    db.complaint.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="صندوق الوارد — الشكاوى"
        description="الشكاوى الجديدة وقيد الفرز. افتح كل شكوى، ثم حوّلها إلى اللجنة المختصة أو استبعدها بسبب مكتوب."
      />
      <DataTable
        rows={rows}
        rowKey={(c) => c.id}
        empty={{ title: 'لا وارد جديد', hint: 'كل الشكاوى فُرزت. الشكاوى الجديدة تظهر هنا فور وصولها.' }}
        pagination={{ page, pageSize: PAGE_SIZE, total, hrefFor: (p) => `/admin/inbox?page=${p}` }}
        columns={[
          {
            key: 'title',
            header: 'الشكوى',
            cell: (c) => (
              <Link href={`/admin/complaints/${c.id}`} className="flex flex-col hover:underline">
                <span className="font-medium text-brand">{c.title}</span>
                <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                  {c.reference}
                </span>
              </Link>
            ),
          },
          { key: 'status', header: 'الحالة', cell: (c) => <StatusBadge kind="complaint" status={c.status} /> },
          {
            key: 'category',
            header: 'التصنيف · اللجنة المقترحة',
            className: 'hidden md:table-cell',
            cell: (c) => (
              <span className="flex flex-col">
                <span>{c.category?.nameAr ?? '—'}</span>
                <span className="text-xs text-muted-foreground">{c.category?.defaultCommittee?.nameAr ?? 'بلا اقتراح'}</span>
              </span>
            ),
          },
          { key: 'area', header: 'المنطقة', className: 'hidden lg:table-cell', cell: (c) => c.area?.nameAr ?? '—' },
          { key: 'date', header: 'وصلت', className: 'hidden sm:table-cell', cell: (c) => formatDateTime(c.createdAt) },
        ]}
      />
    </>
  );
}
