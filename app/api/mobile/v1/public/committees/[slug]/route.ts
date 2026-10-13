import { apiRoute, found } from '@/lib/api/handler';
import { publicCommittee } from '@/lib/committees/queries';

// صفحة لجنة عامة
export const GET = apiRoute<{ slug: string }>({ auth: 'none' }, async ({ params }) => ({ data: found(await publicCommittee(params.slug), 'اللجنة') }));
