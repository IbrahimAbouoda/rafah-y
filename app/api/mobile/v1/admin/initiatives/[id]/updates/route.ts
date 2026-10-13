import { apiRoute, merge } from '@/lib/api/handler';
import { postUpdate } from '@/lib/initiatives/actions';

// تحديث على المبادرة، عام أو داخلي (initiatives:post_update)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await postUpdate(user, merge(body, { initiativeId: params.id }))) ?? undefined,
}));
