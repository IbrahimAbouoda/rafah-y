import { apiRoute, merge } from '@/lib/api/handler';
import { saveArea } from '@/lib/settings/reference';

// المناطق والأحياء (settings:manage) — تعديل
export const PATCH = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await saveArea(user, merge(body, { id: params.id }))) ?? undefined,
}));
