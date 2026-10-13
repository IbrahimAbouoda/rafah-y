import { apiRoute } from '@/lib/api/handler';
import { publicInitiatives } from '@/lib/initiatives/queries';

// المبادرات المنشورة والمبلغ المؤمَّن لكل عملة
export const GET = apiRoute({ auth: 'none' }, async () => ({ data: await publicInitiatives() }));
