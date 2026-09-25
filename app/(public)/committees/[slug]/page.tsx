import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/shared/page-header';
import { StatTile } from '@/components/shared/stat-tile';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'لجنة' };
export const dynamic = 'force-dynamic';

// /committees/[slug] — تعريف لجنة واحدة: المجال، وأرقام عامة، والأفكار المعتمدة لديها. بلا أسماء الأعضاء (Q15).
export default async function PublicCommitteePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const committee = await db.committee.findFirst({
    where: { slug, isActive: true },
    select: { id: true, nameAr: true, mandate: true },
  });
  if (!committee) notFound();

  const [resolved, ideas] = await Promise.all([
    db.complaint.count({ where: { committeeId: committee.id, status: { in: ['RESOLVED', 'CLOSED'] } } }),
    db.idea.findMany({
      where: { committeeId: committee.id, status: { in: ['COMMITTEE_REVIEW', 'APPROVED'] } },
      orderBy: { voteCount: 'desc' },
      take: 10,
      select: { id: true, title: true, status: true, voteCount: true },
    }),
  ]);

  return (
    <>
      <PageHeader title={committee.nameAr} description={committee.mandate ?? undefined} />
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <StatTile label="شكاوى حُلّت" value={resolved} tone="success" emptyWhenZero />
        <StatTile label="أفكار لديها" value={ideas.length} emptyWhenZero />
      </div>
      <Card className="mt-5">
        <CardHeader>
          <CardTitle>أفكار تراجعها اللجنة أو اعتُمدت</CardTitle>
        </CardHeader>
        <CardContent>
          {ideas.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا أفكار لدى اللجنة بعد. تُحال الأفكار إليها بعد الفرز الأولي.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {ideas.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/ideas/${i.id}`} className="text-brand hover:underline">
                    {i.title}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {i.voteCount} صوت
                    <StatusBadge kind="idea" status={i.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Link href="/committees" className="mt-4 inline-block text-sm text-brand hover:underline">
        كل اللجان
      </Link>
    </>
  );
}
