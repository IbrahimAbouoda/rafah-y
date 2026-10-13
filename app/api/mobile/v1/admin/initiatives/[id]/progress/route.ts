import { apiRoute, merge } from '@/lib/api/handler';
import { updateProgress } from '@/lib/initiatives/actions';

// نسبة الإنجاز والمستفيدون (initiatives:update)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await updateProgress(user, merge(body, { initiativeId: params.id }))) ?? undefined,
}));
