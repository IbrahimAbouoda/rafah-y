import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import type { Prisma } from '@/lib/generated/prisma/client';
import type { IdeaStatus } from '@/lib/generated/prisma/enums';
import { IDEA_STATUS_LABELS } from '@/lib/ideas/workflow';
import { guardPage } from '@/lib/page-guard';
import { scopeFilter } from '@/lib/rbac';
import { formatDate } from '@/lib/utils';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Label, Select } from '@/components/ui/form-controls';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'فرز الأفكار' };

const PAGE_SIZE = 25;
const STATUSES = Object.keys(IDEA_STATUS_LABELS) as IdeaStatus[];

// /admin/ideas — ideas:review. «الكل» يرى كل الأفكار؛ رئيس اللجنة يرى أفكار لجنته فقط.
export default async function AdminIdeasPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const params = await searchParams;
  const { user, allowed, backHref } = await guardPage('/admin/ideas', 'ideas:review');
  if (!allowed) return <Forbidden backHref={backHref} />;
  const scope = scopeFilter(user, 'ideas:review');
  if (!scope) return <Forbidden backHref={backHref} />;

  const page = Math.max(1, Number(params.page) || 1);
  const status = STATUSES.includes(params.status as IdeaStatus) ? (params.status as IdeaStatus) : null;
  // الافتراضي: ما ينتظر عملًا
  const statusWhere: Prisma.IdeaWhereInput['status'] = status ?? { in: ['SUBMITTED', 'SCREENING', 'COMMITTEE_REVIEW'] };
  const where: Prisma.IdeaWhereInput = {
    status: statusWhere,
    ...(scope.all ? {} : { committeeId: { in: scope.committees } }),
  };
  const [rows, total] = await Promise.all([
    db.idea.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        reference: true,
        title: true,
        status: true,
        voteCount: true,
        createdAt: true,
        committee: { select: { nameAr: true } },
      },
    }),
    db.idea.count({ where }),
  ]);

  return (
    <>
      <PageHeader title="فرز الأفكار" description="الأقدم أولًا. افرز، ثم أحل للجنة المختصة، والقرار النهائي لرئيس المجلس." />
      <Card className="mb-4 p-3">
        <form action="/admin/ideas" className="flex flex-wrap items-end gap-3" role="search">
          <div className="flex flex-col gap-1">
            <Label htmlFor="status">الحالة</Label>
            <Select id="status" name="status" defaultValue={status ?? ''}>
              <option value="">تنتظر عملًا</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {IDEA_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit">عرض</Button>
        </form>
      </Card>
      <DataTable
        rows={rows}
        rowKey={(i) => i.id}
        empty={{ title: 'لا أفكار تنتظر عملًا', hint: 'الأفكار الجديدة تظهر هنا فور تقديمها. غيّر الحالة لرؤية المحسومة.' }}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total,
          hrefFor: (p) => `/admin/ideas?${new URLSearchParams({ ...(status ? { status } : {}), page: String(p) })}`,
        }}
        columns={[
          {
            key: 'title',
            header: 'الفكرة',
            cell: (i) => (
              <Link href={`/admin/ideas/${i.id}`} className="flex flex-col hover:underline">
                <span className="font-medium text-brand">{i.title}</span>
                <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                  {i.reference}
                </span>
              </Link>
            ),
          },
          { key: 'status', header: 'الحالة', cell: (i) => <StatusBadge kind="idea" status={i.status} /> },
          { key: 'committee', header: 'اللجنة', className: 'hidden md:table-cell', cell: (i) => i.committee?.nameAr ?? '—' },
          { key: 'votes', header: 'الأصوات', cell: (i) => i.voteCount },
          { key: 'date', header: 'قُدّمت', className: 'hidden sm:table-cell', cell: (i) => formatDate(i.createdAt) },
        ]}
      />
    </>
  );
}
