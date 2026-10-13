import { apiRoute, merge } from '@/lib/api/handler';
import { reassignTask } from '@/lib/tasks/actions';

// إعادة إسناد (tasks:update)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await reassignTask(user, merge(body, { taskId: params.id }))) ?? undefined,
}));
