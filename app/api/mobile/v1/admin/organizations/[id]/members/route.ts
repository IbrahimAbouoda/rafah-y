import { apiRoute, merge } from '@/lib/api/handler';
import { linkMember } from '@/lib/organizations/actions';

// ربط ممثّل بالمؤسسة ومنحه دور partner (D26)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await linkMember(user, merge(body, { organizationId: params.id }))) ?? undefined,
}));
