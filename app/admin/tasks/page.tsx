import type { Metadata } from 'next';
import { guardPage } from '@/lib/page-guard';
import { boardTasks } from '@/lib/tasks/board';
import { KanbanBoard } from '@/components/tasks/kanban-board';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, Forbidden } from '@/components/shared/states';
import { Card } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'مهامي' };

// /admin/tasks — «مهامي عبر كل لجاني» (§11.2): ما أُسند إلى المستخدم نفسه، في كل لجانه
export default async function MyTasksPage() {
  const { user, allowed, backHref } = await guardPage('/admin/tasks', 'tasks:read');
  if (!allowed) return <Forbidden backHref={backHref} />;

  const tasks = await boardTasks(user, { assigneeId: user.id });
  return (
    <>
      <PageHeader title="مهامي" description="كل ما أُسند إليك في لجانك. انقل مهمتك حتى «مراجعة» ليعتمدها رئيس اللجنة." />
      {tasks.length === 0 ? (
        <Card>
          <EmptyState title="لا مهام مسندة إليك" hint="حين يسند إليك رئيس اللجنة مهمة تظهر هنا، ويصلك إشعار بها." />
        </Card>
      ) : (
        <KanbanBoard tasks={tasks} />
      )}
    </>
  );
}
