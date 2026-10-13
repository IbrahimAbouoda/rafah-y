import { apiRoute, merge } from '@/lib/api/handler';
import { saveCommittee } from '@/lib/settings/reference';

// اللجان (committees:manage) — تعديل
export const PATCH = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await saveCommittee(user, merge(body, { id: params.id }))) ?? undefined,
}));
