import { apiRoute } from '@/lib/api/handler';
import { partnerHome } from '@/lib/initiatives/queries';

// لوحة المؤسسة (offers:create)
export const GET = apiRoute({ auth: 'required' }, async ({ user }) => ({ data: await partnerHome(user) }));
