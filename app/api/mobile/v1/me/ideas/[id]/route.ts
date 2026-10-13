import { apiRoute, merge } from '@/lib/api/handler';
import { reviseIdea } from '@/lib/ideas/actions';

// تعديل فكرة طُلب تعديلها (CHANGES_REQUESTED) — لصاحبها فقط
export const PATCH = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await reviseIdea(user, merge(body, { ideaId: params.id }))) ?? undefined,
}));
