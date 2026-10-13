import { apiRoute, merge } from '@/lib/api/handler';
import { removeNeed } from '@/lib/initiatives/actions';

// إلغاء احتياج (initiatives:manage_needs)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await removeNeed(user, merge(body, { needId: params.id }))) ?? undefined,
}));
