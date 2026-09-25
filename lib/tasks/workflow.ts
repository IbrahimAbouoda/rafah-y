import type { TaskStatus } from '@/lib/generated/prisma/enums';
import type { PermissionKey } from '@/lib/rbac';

// مسار المهمة — PRD §12 KanbanBoard · AC-06. المصدر الوحيد للانتقالات المسموحة.
// العضو ينقل مهمته حتى «مراجعة» بـ tasks:update؛ «منجزة» تحتاج tasks:approve وحدها (لا اعتماد ذاتي).

type Transition = { to: TaskStatus; permission: PermissionKey };

export const TASK_TRANSITIONS: Record<TaskStatus, Transition[]> = {
  TODO: [{ to: 'IN_PROGRESS', permission: 'tasks:update' }],
  IN_PROGRESS: [
    { to: 'REVIEW', permission: 'tasks:update' },
    { to: 'TODO', permission: 'tasks:update' },
  ],
  REVIEW: [
    { to: 'DONE', permission: 'tasks:approve' },
    // إعادة للعمل: من العضو نفسه أو من الرئيس حين لا يعتمد
    { to: 'IN_PROGRESS', permission: 'tasks:update' },
  ],
  DONE: [],
};

export function taskTransitionPermission(from: TaskStatus, to: TaskStatus): PermissionKey | null {
  return TASK_TRANSITIONS[from].find((t) => t.to === to)?.permission ?? null;
}

export const TASK_COLUMNS: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'قيد الانتظار',
  IN_PROGRESS: 'تنفيذ',
  REVIEW: 'مراجعة',
  DONE: 'منجزة',
};

export const TASK_PRIORITY_LABELS = { LOW: 'منخفضة', MEDIUM: 'متوسطة', HIGH: 'عالية', URGENT: 'عاجلة' } as const;
