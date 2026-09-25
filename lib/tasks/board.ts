import 'server-only';
import { db } from '@/lib/db';
import type { Prisma } from '@/lib/generated/prisma/client';
import { can, scopeFilter, type SessionUser } from '@/lib/rbac';
import type { BoardTask } from '@/components/tasks/kanban-board';

/** شرط المهام التي يقرأها المستخدم بـ tasks:read — لجانه، أو ما أُسند إليه، أو الكل */
export function readableTasks(user: SessionUser): Prisma.TaskWhereInput | null {
  const scope = scopeFilter(user, 'tasks:read');
  if (!scope) return null;
  if (scope.all) return {};
  const or: Prisma.TaskWhereInput[] = [];
  if (scope.committees.length > 0) or.push({ committeeId: { in: scope.committees } });
  if (scope.own) or.push({ assigneeId: user.id });
  return or.length > 0 ? { OR: or } : null;
}

/** بطاقات اللوحة مع ما يحق للمستخدم على كل بطاقة — محسوبًا على الخادم بـ can() */
export async function boardTasks(user: SessionUser, where: Prisma.TaskWhereInput): Promise<BoardTask[]> {
  const rows = await db.task.findMany({
    where,
    orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: 300,
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueAt: true,
      committeeId: true,
      assigneeId: true,
      assignee: { select: { fullName: true } },
      complaint: { select: { id: true, reference: true } },
      comments: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, body: true, createdAt: true, author: { select: { fullName: true } } },
      },
    },
  });
  return rows.map((t) => {
    const ctx = { committeeId: t.committeeId, ownerId: t.assigneeId };
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueAt: t.dueAt?.toISOString() ?? null,
      assignee: t.assignee?.fullName ?? null,
      mine: t.assigneeId === user.id,
      complaint: t.complaint,
      comments: t.comments.map((c) => ({ id: c.id, author: c.author.fullName, body: c.body, at: c.createdAt.toISOString() })),
      canMove: t.status !== 'DONE' && can(user, 'tasks:update', ctx),
      // لا اعتماد ذاتي: الزر لا يظهر لمن أُسندت إليه (والخادم وقاعدة البيانات يرفضان أيضًا)
      canApprove: t.status === 'REVIEW' && t.assigneeId !== user.id && can(user, 'tasks:approve', { committeeId: t.committeeId }),
      canComment: can(user, 'tasks:comment', ctx),
    };
  });
}
