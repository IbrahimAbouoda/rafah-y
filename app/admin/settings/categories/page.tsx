import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { guardPage } from '@/lib/page-guard';
import { CategoryForm } from '@/components/settings/reference-forms';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'تصنيفات الشكاوى' };

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const { allowed, backHref } = await guardPage('/admin/settings/categories', 'settings:manage');
  if (!allowed) return <Forbidden backHref={backHref} />;

  const [categories, committees] = await Promise.all([
    db.complaintCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
      select: {
        id: true,
        nameAr: true,
        defaultCommitteeId: true,
        isActive: true,
        sortOrder: true,
        defaultCommittee: { select: { nameAr: true } },
      },
    }),
    db.committee.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, nameAr: true } }),
  ]);
  const editing = categories.find((c) => c.id === edit);

  return (
    <>
      <PageHeader
        title="تصنيفات الشكاوى"
        description="يختار الشاب التصنيف عند تقديم الشكوى، ويقترح التصنيف لجنة افتراضية عند الفرز."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <DataTable
          rows={categories}
          rowKey={(c) => c.id}
          empty={{ title: 'لا تصنيفات بعد', hint: 'أضف تصنيفات الشكاوى قبل فتح تقديم الشكاوى للشباب، مثل: الخدمات، التعليم، الصحة.' }}
          columns={[
            {
              key: 'name',
              header: 'التصنيف',
              cell: (c) => (
                <Link href={`/admin/settings/categories?edit=${c.id}`} className="font-medium text-brand hover:underline">
                  {c.nameAr}
                </Link>
              ),
            },
            { key: 'committee', header: 'اللجنة المقترحة', cell: (c) => c.defaultCommittee?.nameAr ?? '—' },
            { key: 'status', header: 'الحالة', cell: (c) => <StatusBadge kind="active" status={String(c.isActive)} /> },
          ]}
        />
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{editing ? `تعديل: ${editing.nameAr}` : 'إضافة تصنيف'}</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryForm category={editing} committees={committees} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
