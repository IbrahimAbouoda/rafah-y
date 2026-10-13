import { apiRoute, merge } from '@/lib/api/handler';
import { approveTask } from '@/lib/tasks/actions';

// اعتماد المهمة (tasks:approve) — لا اعتماد ذاتي (tasks_no_self_approval)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await approveTask(user, merge(body, { taskId: params.id }))) ?? undefined,
}));
