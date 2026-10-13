import { apiRoute } from '@/lib/api/handler';
import { openNeeds } from '@/lib/initiatives/queries';

// «ادعمنا» — الاحتياجات المفتوحة. لا تسجيل ذاتي للمؤسسات (D26)
export const GET = apiRoute({ auth: 'none' }, async () => ({ data: await openNeeds() }));
