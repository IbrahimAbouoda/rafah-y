import { apiRoute, found } from '@/lib/api/handler';
import { committeeDashboard } from '@/lib/committees/queries';

// لوحة اللجنة — لجنة غيرك 404
export const GET = apiRoute<{ slug: string }>({ auth: 'required' }, async ({ user, params }) => ({ data: found(await committeeDashboard(user, params.slug), 'اللجنة') }));
