import { apiRoute, merge } from '@/lib/api/handler';
import { unlinkMember } from '@/lib/organizations/actions';

// فك ربط ممثّل
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await unlinkMember(user, merge(body, { organizationId: params.id }))) ?? undefined,
}));
