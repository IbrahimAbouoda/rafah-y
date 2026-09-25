import type { Metadata } from 'next';
import Link from 'next/link';
import { readableCommitteesWhere } from '@/lib/committees';
import { OPEN_STATUSES } from '@/lib/complaints/workflow';
import { db } from '@/lib/db';
import { guardPage } from '@/lib/page-guard';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, Forbidden } from '@/components/shared/states';
import { Card } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'اللجان' };

// /admin/committees — «اللجان التي أنتمي إليها» (§11.2): committees:read بنطاق لجنته، أو الكل لمن نطاقه الكل
export default async function CommitteesPage() {
  const { user, allowed, backHref } = await guardPage('/admin/committees', 'committees:read', { beyondOwn: true });
  if (!allowed) return <Forbidden backHref={backHref} />;
  const where = readableCommitteesWhere(user);
  if (!where) return <Forbidden backHref={backHref} />;

  const committees = await db.committee.findMany({
    where: { ...where, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      slug: true,
      nameAr: true,
      mandate: true,
      _count: {
        select: {
          complaints: { where: { status: { in: OPEN_STATUSES } } },
          tasks: { where: { status: { not: 'DONE' } } },
        },
      },
    },
  });

  return (
    <>
      <PageHeader title="اللجان" description="لوحة كل لجنة: شكاواها المفتوحة، ومهامها، وأفكارها قيد المراجعة." />
      {committees.length === 0 ? (
        <Card>
          <EmptyState title="لا لجان لك في الدورة الحالية" hint="حين يعيّنك رئيس المجلس عضوًا في لجنة تظهر هنا." />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {committees.map((c) => (
            <Link key={c.id} href={`/admin/committees/${c.slug}`} className="rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
              <Card className="flex h-full flex-col gap-2 p-4 transition-colors hover:bg-muted/50">
                <p className="font-semibold text-brand">{c.nameAr}</p>
                {c.mandate ? <p className="line-clamp-2 text-sm text-muted-foreground">{c.mandate}</p> : null}
                <p className="mt-auto text-xs text-muted-foreground">
                  {c._count.complaints} شكوى مفتوحة · {c._count.tasks} مهمة جارية
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
