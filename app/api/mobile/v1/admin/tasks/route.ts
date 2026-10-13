import { apiRoute } from '@/lib/api/handler';
import { myTasks } from '@/lib/committees/queries';
import { createTask } from '@/lib/tasks/actions';

// «مهامي» · POST ينشئ مهمة (tasks:create بنطاق اللجنة — AC-05)
export const GET = apiRoute({ auth: 'required' }, async ({ user }) => ({ data: await myTasks(user) }));
export const POST = apiRoute({ auth: 'required' }, async ({ user, body }) => ({ message: (await createTask(user, body)) ?? undefined, status: 201 }));
