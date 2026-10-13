import { apiRoute, merge } from '@/lib/api/handler';
import { logInteraction } from '@/lib/organizations/actions';

// تسجيل تواصل (organizations:log)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await logInteraction(user, merge(body, { organizationId: params.id }))) ?? undefined,
}));
