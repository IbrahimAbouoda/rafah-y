import { z } from 'zod';
import { optionalDate, optionalText, optionalUuid } from './common';

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const;

const taskId = z.uuid('المهمة غير محددة. حدّث الصفحة.');

// AC-05: الإسناد جزء من الإنشاء
export const CreateTaskSchema = z.object({
  committeeId: z.uuid('اللجنة غير محددة. افتح لوحة اللجنة من جديد.'),
  complaintId: optionalUuid('الشكوى غير محددة.'),
  title: z.string().trim().min(3, 'اكتب عنوان المهمة (3 محارف على الأقل).').max(200, 'العنوان أطول من 200 محرف.'),
  description: optionalText(2000, 'الوصف أطول من 2000 محرف.'),
  assigneeId: z.uuid('اختر العضو المسند إليه.'),
  priority: z.enum(TASK_PRIORITIES, { error: 'اختر الأولوية.' }).default('MEDIUM'),
  dueAt: optionalDate('اكتب آخر موعد صحيحًا أو اتركه فارغًا.'),
});

export const ReassignTaskSchema = z.object({ taskId, assigneeId: z.uuid('اختر العضو المسند إليه.') });

export const MoveTaskSchema = z.object({ taskId, toStatus: z.enum(TASK_STATUSES, { error: 'الحالة غير معروفة.' }) });

export const TaskIdSchema = z.object({ taskId });

export const CommentTaskSchema = z.object({
  taskId,
  body: z.string().trim().min(2, 'اكتب الملاحظة.').max(2000, 'الملاحظة أطول من 2000 محرف.'),
});
