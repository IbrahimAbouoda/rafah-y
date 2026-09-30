import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { guardPage } from '@/lib/page-guard';
import { CommitteeForm } from '@/components/settings/reference-forms';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'اللجان' };

export default async function CommitteesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const { allowed, backHref } = await guardPage('/admin/settings/committees', 'committees:manage');
  if (!allowed) return <Forbidden backHref={backHref} />;

  const committees = await db.committee.findMany({
    orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
    select: { id: true, slug: true, nameAr: true, mandate: true, isActive: true, sortOrder: true },
  });
  const editing = committees.find((c) => c.id === edit);

  return (
    <>
      <PageHeader
        title="اللجان"
        description="اللجنة سجل بيانات: تُضاف لجنة جديدة من هنا بلا تعديل في الكود. تعطيل لجنة يخفيها من قوائم التعيين والتحويل ولا يحذف تاريخها."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <DataTable
          rows={committees}
          rowKey={(c) => c.id}
          empty={{ title: 'لا لجان بعد', hint: 'أضف اللجنة الأولى من النموذج، أو شغّل البذرة لتحميل اللجان التسع.' }}
          columns={[
            {
              key: 'name',
              header: 'اللجنة',
              cell: (c) => (
                <Link href={`/admin/settings/committees?edit=${c.id}`} className="font-medium text-brand hover:underline">
                  {c.nameAr}
                </Link>
              ),
            },
            { key: 'slug', header: 'المعرّف', cell: (c) => <code dir="ltr" className="text-xs">{c.slug}</code>, className: 'hidden sm:table-cell' },
            { key: 'status', header: 'الحالة', cell: (c) => <StatusBadge kind="active" status={String(c.isActive)} /> },
          ]}
        />
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{editing ? `تعديل: ${editing.nameAr}` : 'إضافة لجنة'}</CardTitle>
          </CardHeader>
          <CardContent>
            <CommitteeForm committee={editing} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
