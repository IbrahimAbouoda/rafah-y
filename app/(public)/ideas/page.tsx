import type { Metadata } from 'next';
import Link from 'next/link';
import { Lightbulb } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { IDEA_STATUS_LABELS, PUBLIC_IDEA_STATUSES } from '@/lib/ideas/workflow';
import { can } from '@/lib/rbac';
import { formatDate } from '@/lib/utils';
import { VoteButton } from '@/components/ideas/vote-button';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Label, Select } from '@/components/ui/form-controls';
import { Card } from '@/components/ui/surface';
import { publicIdeas } from '@/lib/ideas/queries';
import { toPage } from '@/lib/paging';

export const metadata: Metadata = { title: 'الأفكار' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;
type Search = { committee?: string; area?: string; status?: string; sort?: string; page?: string };

function hrefWith(params: Search, patch: Partial<Search>) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) next.set(k, String(v));
  const qs = next.toString();
  return `/ideas${qs ? `?${qs}` : ''}`;
}

// /ideas — عام. تصفية باللجنة والمنطقة والحالة (D24)، والأكثر تأييدًا أولًا. بلا اسم صاحب الفكرة (افتراض Q17).
export default async function IdeasPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const { items: ideas, total, committees, areas, status, page } = await publicIdeas(
    user,
    { status: params.status, committee: params.committee, area: params.area, sort: params.sort },
    toPage(params.page, PAGE_SIZE),
  );
  const modes = new Map(ideas.map((i) => [i.id, i.voteMode]));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = !!(params.committee || params.area || status);

  return (
    <>
      <PageHeader
        title="أفكار الشباب"
        description="أفكار قدّمها شباب رفح، تمرّ بفرز ومراجعة لجنة ثم قرار المجلس. تأييدك يرفع أولوية الفكرة ولا يعتمدها وحده."
      >
        {user && can(user, 'ideas:create') ? (
          <Button asChild>
            <Link href="/me/ideas/new">
              <Lightbulb aria-hidden />
              قدّم فكرة
            </Link>
          </Button>
        ) : !user ? (
          <Button asChild variant="outline">
            <Link href="/login?next=/me/ideas/new">سجّل الدخول لتقدّم فكرة</Link>
          </Button>
        ) : null}
      </PageHeader>

      <Card className="mb-4 p-3">
        <form action="/ideas" className="grid gap-3 sm:grid-cols-4 sm:items-end" role="search">
          <div className="flex flex-col gap-1">
            <Label htmlFor="committee">اللجنة</Label>
            <Select id="committee" name="committee" defaultValue={params.committee ?? ''}>
              <option value="">كل اللجان</option>
              {committees.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.nameAr}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="area">المنطقة</Label>
            <Select id="area" name="area" defaultValue={params.area ?? ''}>
              <option value="">كل المناطق</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nameAr}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="status">الحالة</Label>
            <Select id="status" name="status" defaultValue={status ?? ''}>
              <option value="">كل الحالات</option>
              {PUBLIC_IDEA_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {IDEA_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <Select name="sort" defaultValue={params.sort ?? ''} aria-label="الترتيب">
              <option value="">الأكثر تأييدًا</option>
              <option value="new">الأحدث</option>
            </Select>
            <Button type="submit">عرض</Button>
          </div>
        </form>
      </Card>

      {ideas.length === 0 ? (
        <Card>
          <EmptyState
            title={filtered ? 'لا أفكار بهذه التصفية' : 'لا أفكار منشورة بعد'}
            hint={
              filtered
                ? 'غيّر اللجنة أو المنطقة أو الحالة.'
                : 'تظهر الأفكار هنا بعد فرزها الأولي. كن أول من يقدّم فكرة لحيّه.'
            }
          >
            {filtered ? (
              <Button asChild variant="ghost">
                <Link href="/ideas">مسح التصفية</Link>
              </Button>
            ) : null}
          </EmptyState>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {ideas.map((i) => (
            <li key={i.id}>
              <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <Link href={`/ideas/${i.id}`} className="font-semibold text-brand hover:underline">
                    {i.title}
                  </Link>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{i.problem}</p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <StatusBadge kind="idea" status={i.status} />
                    <span>{i.committee?.nameAr ?? 'لم تُحَل للجنة بعد'}</span>
                    {i.area ? <span>· {i.area.nameAr}</span> : null}
                    <span>· {formatDate(i.createdAt)}</span>
                  </p>
                </div>
                <VoteButton ideaId={i.id} count={i.voteCount} state={modes.get(i.id) ?? 'closed'} />
              </Card>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="الصفحات" className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            صفحة {page} من {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link href={hrefWith(params, { page: String(page - 1) })}>السابقة</Link>
              </Button>
            ) : null}
            {page < pages ? (
              <Button asChild variant="outline" size="sm">
                <Link href={hrefWith(params, { page: String(page + 1) })}>التالية</Link>
              </Button>
            ) : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}
