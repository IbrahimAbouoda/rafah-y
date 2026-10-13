import { apiRoute, merge } from '@/lib/api/handler';
import { commentTask } from '@/lib/tasks/actions';

// تعليق على مهمة (tasks:comment)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await commentTask(user, merge(body, { taskId: params.id }))) ?? undefined,
}));
