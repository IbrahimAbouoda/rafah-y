import { apiRoute, found, merge } from '@/lib/api/handler';
import { saveOrganization } from '@/lib/organizations/actions';
import { organizationFile } from '@/lib/organizations/queries';

// ملف مؤسسة · PATCH يعدّل بياناتها
export const GET = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params }) => ({ data: found(await organizationFile(user, params.id), 'المؤسسة') }));
export const PATCH = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await saveOrganization(user, merge(body, { id: params.id }))) ?? undefined,
}));
