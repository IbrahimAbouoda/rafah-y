import { apiRoute } from '@/lib/api/handler';
import { partnerNeeds } from '@/lib/initiatives/queries';

// الاحتياجات المفتوحة ومؤسساتك لاختيار المقدِّمة
export const GET = apiRoute({ auth: 'required' }, async ({ user }) => ({ data: await partnerNeeds(user) }));
