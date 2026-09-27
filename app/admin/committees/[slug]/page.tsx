import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { KanbanSquare } from 'lucide-react';
import { committeeMembers, myCommittees } from '@/lib/committees';
import { OPEN_STATUSES } from '@/lib/complaints/workflow';
import { db } from '@/lib/db';
import { guardPage } from '@/lib/page-guard';
import { can } from '@/lib/rbac';
import { formatDate } from '@/lib/utils';
import { CommitteeSwitcher } from '@/components/shared/committee-switcher';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { StatTile } from '@/components/shared/stat-tile';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'لوحة اللجنة' };

const startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0));

// لوحة اللجنة — مساحة عملها: الشكاوى المحوّلة بمواعيد متابعتها (D23)، والمهام، والأفكار قيد مراجعتها.
export default async function CommitteeDashboard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, allowed, backHref } = await guardPage(`/admin/committees/${slug}`, 'committees:read', { beyondOwn: true });
  if (!allowed) return <Forbidden backHref={backHref} />;

  const committee = await db.committee.findUnique({ where: { slug }, select: { id: true, slug: true, nameAr: true, mandate: true } });
  // لجنة غيره = غير موجودة، فلا يكشف التخمين وجودها (معيار Sprint 2)
  if (!committee || !can(user, 'committees:read', { committeeId: committee.id })) notFound();

  const today = startOfToday();
  const readComplaints = can(user, 'complaints:read', { committeeId: committee.id });
  const readTasks = can(user, 'tasks:read', { committeeId: committee.id });
  const readIdeas = can(user, 'ideas:read_internal', { committeeId: committee.id });
  // عضو اللجنة يسجّل الحضور ولا يملك activities:update، فيصل لصفحة الحضور من هنا (AC-13)
  const markAttendance = can(user, 'activities:attendance', { committeeId: committee.id });
  const openWhere = { committeeId: committee.id, status: { in: OPEN_STATUSES } };

  const [complaints, openCount, overdue, tasksInReview, openTasks, ideas, members, activities] = await Promise.all([
    readComplaints
      ? db.complaint.findMany({
          where: openWhere,
          orderBy: [{ followUpAt: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'asc' }],
          take: 50,
          select: { id: true, reference: true, title: true, status: true, followUpAt: true, updatedAt: true },
        })
      : null,
    readComplaints ? db.complaint.count({ where: openWhere }) : null,
    readComplaints ? db.complaint.count({ where: { ...openWhere, followUpAt: { lt: today } } }) : null,
    readTasks ? db.task.count({ where: { committeeId: committee.id, status: 'REVIEW' } }) : null,
    readTasks ? db.task.count({ where: { committeeId: committee.id, status: { not: 'DONE' } } }) : null,
    readIdeas
      ? db.idea.findMany({
          where: { committeeId: committee.id, status: { in: ['COMMITTEE_REVIEW', 'CHANGES_REQUESTED'] } },
          orderBy: { voteCount: 'desc' },
          take: 20,
          select: { id: true, reference: true, title: true, status: true, voteCount: true },
        })
      : null,
    committeeMembers(db, committee.id),
    markAttendance
      ? db.activity.findMany({
          where: { committeeId: committee.id, status: { in: ['PUBLISHED', 'COMPLETED'] } },
          orderBy: { startsAt: 'desc' },
          take: 10,
          select: { id: true, title: true, status: true, startsAt: true },
        })
      : null,
  ]);

  return (
    <>
      <PageHeader title={committee.nameAr} description={committee.mandate ?? undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <CommitteeSwitcher committees={myCommittees(user)} current={committee.slug} />
          {readTasks ? (
            <Button asChild>
              <Link href={`/admin/committees/${committee.slug}/tasks`}>
                <KanbanSquare aria-hidden />
                لوحة المهام
              </Link>
            </Button>
          ) : null}
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="شكاوى مفتوحة" value={openCount} tone="brand" />
        <StatTile label="متابعات متأخرة" value={overdue} tone="warning" meta="فات موعد متابعتها" />
        <StatTile label="مهام جارية" value={openTasks} href={readTasks ? `/admin/committees/${committee.slug}/tasks` : undefined} />
        <StatTile label="بانتظار الاعتماد" value={tasksInReview} tone="success" meta="في عمود «مراجعة»" />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          {complaints ? (
            <section className="flex flex-col gap-2">
              <h2 className="font-semibold">الشكاوى المحوّلة للجنة</h2>
              <DataTable
                rows={complaints}
                rowKey={(c) => c.id}
                empty={{ title: 'لا شكاوى مفتوحة للجنة', hint: 'حين تحوّل أمانة السر شكوى إلى اللجنة تظهر هنا، ويصل رئيسها إشعار.' }}
                columns={[
                  {
                    key: 'title',
                    header: 'الشكوى',
                    cell: (c) => (
                      <Link href={`/admin/complaints/${c.id}`} className="flex flex-col hover:underline">
                        <span className="font-medium text-brand">{c.title}</span>
                        <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                          {c.reference}
                        </span>
                      </Link>
                    ),
                  },
                  { key: 'status', header: 'الحالة', cell: (c) => <StatusBadge kind="complaint" status={c.status} /> },
                  {
                    key: 'followUp',
                    header: 'المتابعة',
                    cell: (c) =>
                      c.followUpAt ? (
                        <span className={c.followUpAt < today ? 'font-medium text-danger' : undefined}>
                          {formatDate(c.followUpAt)}
                          {c.followUpAt < today ? ' — متأخرة' : ''}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">بلا موعد</span>
                      ),
                  },
                ]}
              />
            </section>
          ) : null}

          {ideas ? (
            <section className="flex flex-col gap-2">
              <h2 className="font-semibold">أفكار قيد مراجعة اللجنة</h2>
              <DataTable
                rows={ideas}
                rowKey={(i) => i.id}
                empty={{ title: 'لا أفكار قيد المراجعة', hint: 'تحيل أمانة السر الأفكار إلى اللجنة بعد الفرز الأولي.' }}
                columns={[
                  {
                    key: 'title',
                    header: 'الفكرة',
                    cell: (i) =>
                      can(user, 'ideas:review', { committeeId: committee.id }) ? (
                        <Link href={`/admin/ideas/${i.id}`} className="font-medium text-brand hover:underline">
                          {i.title}
                        </Link>
                      ) : (
                        <Link href={`/ideas/${i.id}`} className="font-medium text-brand hover:underline">
                          {i.title}
                        </Link>
                      ),
                  },
                  { key: 'status', header: 'الحالة', cell: (i) => <StatusBadge kind="idea" status={i.status} /> },
                  { key: 'votes', header: 'الأصوات', cell: (i) => i.voteCount },
                ]}
              />
            </section>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          {activities ? (
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>أنشطة اللجنة والحضور</CardTitle>
              </CardHeader>
              <CardContent>
                {activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا أنشطة منشورة للجنة بعد. ينشرها رئيس اللجنة من «الأنشطة».</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {activities.map((a) => (
                      <li key={a.id} className="flex flex-col gap-0.5">
                        <Link href={`/admin/activities/${a.id}/attendance`} className="text-brand hover:underline">
                          {a.title}
                        </Link>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          {formatDate(a.startsAt)} <StatusBadge kind="activity" status={a.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>الأعضاء في الدورة الحالية</CardTitle>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا أعضاء معيّنين بعد. يعيّنهم رئيس المجلس من «المستخدمون والأدوار».</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {members.map((m) => (
                    <li key={m.id} className="flex flex-col">
                      <span>{m.fullName}</span>
                      <span className="text-xs text-muted-foreground">{m.roles.join('، ')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
