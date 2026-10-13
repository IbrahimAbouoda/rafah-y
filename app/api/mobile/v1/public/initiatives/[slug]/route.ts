import { apiRoute, found } from '@/lib/api/handler';
import { publicInitiative } from '@/lib/initiatives/queries';

// مبادرة منشورة باحتياجاتها المرقّمة وشركائها وتحديثاتها العامة
export const GET = apiRoute<{ slug: string }>({ auth: 'none' }, async ({ params }) => ({ data: found(await publicInitiative(params.slug), 'المبادرة') }));
