import { apiRoute, found, merge } from '@/lib/api/handler';
import { saveInitiative } from '@/lib/initiatives/actions';
import { initiativeFile } from '@/lib/initiatives/admin';

// ملف المبادرة والإجراءات المتاحة — مبادرة لجنة غيرك 404. PATCH يعدّل بياناتها (initiatives:update)
export const GET = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params }) => ({ data: found(await initiativeFile(user, params.id), 'المبادرة') }));
export const PATCH = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await saveInitiative(user, merge(body, { id: params.id }))) ?? undefined,
}));
