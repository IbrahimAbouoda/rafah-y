import { apiRoute, merge } from '@/lib/api/handler';
import { upsertNeed } from '@/lib/initiatives/actions';

// إضافة احتياج مرقّم أو تعديله (initiatives:manage_needs) — يمرّر needId للتعديل
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await upsertNeed(user, merge(body, { initiativeId: params.id }))) ?? undefined,
}));
