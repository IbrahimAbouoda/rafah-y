import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatDate } from '@/lib/utils';
import { DemandPollVote } from '@/components/initiatives/demand-vote';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'فرصة عمل... كيف أكون؟' };
export const dynamic = 'force-dynamic';

// /demand — demand:vote للتصويت. حين يبلغ مجال حد المقترح يُنشئ النظام مسودة مقترح للمجلس (AC-12).
export default async function DemandPage() {
  const user = await getCurrentUser();
  const now = new Date();
  const polls = await db.demandPoll.findMany({
    where: { isActive: true, OR: [{ closesAt: null }, { closesAt: { gt: now } }] },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      description: true,
      proposalThreshold: true,
      closesAt: true,
      options: { orderBy: { sortOrder: 'asc' }, select: { id: true, label: true, voteCount: true } },
    },
  });
  const mine = user
    ? new Map(
        (await db.demandVote.findMany({ where: { userId: user.id, pollId: { in: polls.map((p) => p.id) } } })).map((v) => [v.pollId, v.optionId]),
      )
    : new Map<string, string>();
  const mode = !user ? 'login' : can(user, 'demand:vote') ? 'can' : 'closed';

  return (
    <>
      <PageHeader
        title="فرصة عمل... كيف أكون؟"
        description="صوّت للمجال الذي تريد أن تتعلّمه. حين يبلغ مجالٌ الحد يكتب المجلس مقترح تدريب يعرضه على المؤسسات المانحة."
      />
      {polls.length === 0 ? (
        <Card>
          <EmptyState title="لا استطلاعات مفتوحة الآن" hint="يطرح المجلس استطلاعات مجالات التدريب هنا دوريًا. عد قريبًا." />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {polls.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle>{p.title}</CardTitle>
                <CardDescription>
                  {p.description ? `${p.description} · ` : ''}حد المقترح {p.proposalThreshold} صوتًا
                  {p.closesAt ? ` · يُغلق ${formatDate(p.closesAt)}` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DemandPollVote
                  pollId={p.id}
                  options={p.options}
                  myOptionId={mine.get(p.id) ?? null}
                  threshold={p.proposalThreshold}
                  mode={mode}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
