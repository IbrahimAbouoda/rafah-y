import { apiRoute } from '@/lib/api/handler';
import { openDemandPolls } from '@/lib/ideas/queries';

// استطلاعات الطلب المفتوحة — اختيارك في كل منها إن أرسلت رمزًا
export const GET = apiRoute({ auth: 'optional' }, async ({ user }) => ({ data: await openDemandPolls(user) }));
