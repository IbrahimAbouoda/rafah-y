import { apiRoute, merge } from '@/lib/api/handler';
import { saveCategory } from '@/lib/settings/reference';

// تصنيفات الشكاوى (settings:manage) — تعديل
export const PATCH = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await saveCategory(user, merge(body, { id: params.id }))) ?? undefined,
}));
