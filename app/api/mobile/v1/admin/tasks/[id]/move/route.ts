import { apiRoute, merge } from '@/lib/api/handler';
import { moveTask } from '@/lib/tasks/actions';

// نقل البطاقة — العضو حتى «مراجعة» فقط (AC-06)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await moveTask(user, merge(body, { taskId: params.id }))) ?? undefined,
}));
