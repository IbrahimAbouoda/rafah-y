import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { guardPage } from '@/lib/page-guard';
import { AreaForm } from '@/components/settings/reference-forms';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'المناطق والأحياء' };

export default async function AreasPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const { allowed, backHref } = await guardPage('/admin/settings/areas', 'settings:manage');
  if (!allowed) return <Forbidden backHref={backHref} />;

  const areas = await db.area.findMany({
    orderBy: { nameAr: 'asc' },
    select: { id: true, nameAr: true, parentId: true, parent: { select: { nameAr: true } }, _count: { select: { children: true } } },
  });
  const editing = areas.find((a) => a.id === edit);

  return (
    <>
      <PageHeader
        title="المناطق والأحياء"
        description="شجرة مناطق رفح وأحيائها، لتعمل إحصاءات «أكثر القضايا حسب المنطقة». لا يُطلب من الشاب عنوان تفصيلي."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <DataTable
          rows={areas}
          rowKey={(a) => a.id}
          empty={{ title: 'لا مناطق بعد', hint: 'أضف المناطق الرئيسية أولًا، ثم الأحياء التابعة لكل منطقة.' }}
          columns={[
            {
              key: 'name',
              header: 'المنطقة',
              cell: (a) => (
                <Link href={`/admin/settings/areas?edit=${a.id}`} className="font-medium text-brand hover:underline">
                  {a.nameAr}
                </Link>
              ),
            },
            { key: 'parent', header: 'تتبع', cell: (a) => a.parent?.nameAr ?? '—' },
            { key: 'children', header: 'أحياء تابعة', cell: (a) => a._count.children, className: 'hidden sm:table-cell' },
          ]}
        />
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{editing ? `تعديل: ${editing.nameAr}` : 'إضافة منطقة'}</CardTitle>
          </CardHeader>
          <CardContent>
            <AreaForm area={editing} areas={areas} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
