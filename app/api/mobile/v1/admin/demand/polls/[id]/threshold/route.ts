import { apiRoute, merge } from '@/lib/api/handler';
import { setThreshold } from '@/lib/demand/actions';

// حد المقترح للاستطلاع (demand:manage)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await setThreshold(user, merge(body, { pollId: params.id }))) ?? undefined,
}));
