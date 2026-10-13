import { apiRoute, merge } from '@/lib/api/handler';
import { revokeRole } from '@/lib/settings/roles';

// سحب تعيين — يسري في الطلب التالي (AC-16 ②)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await revokeRole(user, merge(body, { assignmentId: params.id }))) ?? undefined,
}));
