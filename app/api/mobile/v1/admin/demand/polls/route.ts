import { apiRoute } from '@/lib/api/handler';
import { createPoll } from '@/lib/demand/actions';

// استطلاع طلب جديد (demand:manage)
export const POST = apiRoute({ auth: 'required' }, async ({ user, body }) => ({ message: (await createPoll(user, body)) ?? undefined, status: 201 }));
