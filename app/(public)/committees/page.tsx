import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/states';
import { Card } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'اللجان' };
export const dynamic = 'force-dynamic';

// /committees — عام. أسماء الأعضاء لا تُعرض حتى يُجاب Q15.
export default async function PublicCommitteesPage() {
  const committees = await db.committee.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { slug: true, nameAr: true, mandate: true },
  });
  return (
    <>
      <PageHeader title="لجان المجلس" description="تسع لجان تعمل على شكاوى الشباب وأفكارهم ومبادراتهم، كلٌّ في مجالها." />
      {committees.length === 0 ? (
        <Card>
          <EmptyState title="لا لجان منشورة بعد" hint="تظهر اللجان هنا حين يضيفها المجلس." />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {committees.map((c) => (
            <Link key={c.slug} href={`/committees/${c.slug}`} className="rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
              <Card className="flex h-full flex-col gap-2 p-4 transition-colors hover:bg-muted/50">
                <p className="font-semibold text-brand">{c.nameAr}</p>
                <p className="line-clamp-3 text-sm text-muted-foreground">{c.mandate ?? 'يُنشر وصف مجال اللجنة قريبًا.'}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
