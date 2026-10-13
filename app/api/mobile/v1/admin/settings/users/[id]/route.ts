import { apiRoute, found } from '@/lib/api/handler';
import { userRoles } from '@/lib/settings/queries';

// تعيينات مستخدم وما يلزم نموذج التعيين
export const GET = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params }) => ({ data: found(await userRoles(user, params.id), 'المستخدم') }));
