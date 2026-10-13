import { apiRoute, merge } from '@/lib/api/handler';
import { assignRole } from '@/lib/settings/roles';

// تعيين دور (users:manage_roles) — AC-16
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await assignRole(user, merge(body, { userId: params.id }))) ?? undefined,
}));
