import type { Metadata } from 'next';
import Link from 'next/link';
import { IDEA_STATUS_LABELS } from '@/lib/ideas/workflow';
import { guardPage } from '@/lib/page-guard';
import { formatDate } from '@/lib/utils';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Label, Select } from '@/components/ui/form-controls';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/surface';
import { ideaReviewList, REVIEW_STATUSES } from '@/lib/ideas/queries';
import { toPage } from '@/lib/paging';

export const metadata: Metadata = { title: 'فرز الأفكار' };

const PAGE_SIZE = 25;
const STATUSES = REVIEW_STATUSES;

// /admin/ideas — ideas:review. «الكل» يرى كل الأفكار؛ رئيس اللجنة يرى أفكار لجنته فقط.
export default async function AdminIdeasPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const params = await searchParams;
  const { user, allowed, backHref } = await guardPage('/admin/ideas', 'ideas:review');
  if (!allowed) return <Forbidden backHref={backHref} />;
  const list = await ideaReviewList(user, params.status, toPage(params.page, PAGE_SIZE));
  if (!list) return <Forbidden backHref={backHref} />;
  const { items: rows, total, status, page } = list;

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
