import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { guardPage } from '@/lib/page-guard';
import { can } from '@/lib/rbac';
import { formatDate } from '@/lib/utils';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'شكاواي' };

const PAGE_SIZE = 20;

export default async function MyComplaintsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const { user, allowed, backHref } = await guardPage('/me/complaints', 'complaints:read');
  if (!allowed) return <Forbidden backHref={backHref} />;

  const page = Math.max(1, Number(params.page) || 1);
  // «خاص»: ما قدّمه باسمه — حتى من يملك نطاق «الكل» لا يرى هنا إلا شكاواه
  const where = { submitterId: user.id };
  const [rows, total] = await Promise.all([
    db.complaint.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        reference: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        committee: { select: { nameAr: true } },
      },
    }),
    db.complaint.count({ where }),
  ]);

  return (
    <>
      <PageHeader title="شكاواي" description="الشكاوى التي قدّمتها باسمك. المجهولة لا تظهر هنا — تابعها من صفحة التتبّع.">
        {can(user, 'complaints:create') ? (
          <Button asChild>
            <Link href="/me/complaints/new">تقديم شكوى</Link>
          </Button>
        ) : null}
      </PageHeader>
      <DataTable
        rows={rows}
        rowKey={(c) => c.id}
        empty={{
          title: 'لم تقدّم شكوى باسمك بعد',
          hint: 'حين تقدّم شكوى تظهر هنا بحالتها وكل تحديث عليها. إن قدّمت شكوى مجهولة فتابعها بالرقم والرمز من صفحة التتبّع.',
        }}
        pagination={{ page, pageSize: PAGE_SIZE, total, hrefFor: (p) => `/me/complaints?page=${p}` }}
        columns={[
          {
            key: 'ref',
            header: 'الشكوى',
            cell: (c) => (
              <Link href={`/me/complaints/${c.reference}`} className="flex flex-col hover:underline">
                <span className="font-medium text-brand">{c.title}</span>
                <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                  {c.reference}
                </span>
              </Link>
            ),
          },
          { key: 'status', header: 'الحالة', cell: (c) => <StatusBadge kind="complaint" status={c.status} /> },
          { key: 'committee', header: 'اللجنة', cell: (c) => c.committee?.nameAr ?? '—', className: 'hidden sm:table-cell' },
          { key: 'date', header: 'قُدّمت', cell: (c) => formatDate(c.createdAt), className: 'hidden sm:table-cell' },
        ]}
      />
    </>
  );
}
