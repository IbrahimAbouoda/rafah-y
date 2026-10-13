import { apiRoute, merge } from '@/lib/api/handler';
import { setOrganizationStage } from '@/lib/organizations/actions';

// مرحلة العلاقة (organizations:manage)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await setOrganizationStage(user, merge(body, { organizationId: params.id }))) ?? undefined,
}));
