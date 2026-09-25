import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { committeeMembers, myCommittees } from '@/lib/committees';
import { db } from '@/lib/db';
import { guardPage } from '@/lib/page-guard';
import { can } from '@/lib/rbac';
import { boardTasks } from '@/lib/tasks/board';
import { CommitteeSwitcher } from '@/components/shared/committee-switcher';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { CreateTaskForm } from '@/components/tasks/create-task-form';
import { KanbanBoard } from '@/components/tasks/kanban-board';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'مهام اللجنة' };

// /admin/committees/[slug]/tasks — tasks:read (لجنة) · AC-05 · AC-06
export default async function CommitteeTasksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, allowed, backHref } = await guardPage(`/admin/committees/${slug}/tasks`, 'tasks:read', { beyondOwn: true });
  if (!allowed) return <Forbidden backHref={backHref} />;

  const committee = await db.committee.findUnique({ where: { slug }, select: { id: true, slug: true, nameAr: true } });
  if (!committee || !can(user, 'tasks:read', { committeeId: committee.id })) notFound();

  const canCreate = can(user, 'tasks:create', { committeeId: committee.id });
  const [tasks, members] = await Promise.all([
    boardTasks(user, { committeeId: committee.id }),
    canCreate ? committeeMembers(db, committee.id) : [],
  ]);

  return (
    <>
      <PageHeader
        title={`مهام ${committee.nameAr}`}
        description="العضو ينقل مهمته حتى «مراجعة»، ورئيس اللجنة يعتمدها منجزة. لا يعتمد أحد مهمة مسندة إليه."
      >
        <div className="flex items-center gap-2">
          <CommitteeSwitcher committees={myCommittees(user)} current={committee.slug} section="tasks" />
          <Link href={`/admin/committees/${committee.slug}`} className="text-sm text-brand hover:underline">
            لوحة اللجنة
          </Link>
        </div>
      </PageHeader>
      <div className="flex flex-col gap-5">
        <KanbanBoard tasks={tasks} />
        {canCreate ? (
          <Card>
            <CardHeader>
              <CardTitle>مهمة جديدة</CardTitle>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا أعضاء في اللجنة لإسناد المهام إليهم. يعيّنهم رئيس المجلس أولًا.</p>
              ) : (
                <CreateTaskForm committeeId={committee.id} members={members} />
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
