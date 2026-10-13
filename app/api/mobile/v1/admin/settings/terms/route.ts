import { apiRoute } from '@/lib/api/handler';
import { councilTerms } from '@/lib/settings/queries';
import { startTerm } from '@/lib/settings/terms';

// دورات المجلس · POST يبدأ دورة جديدة (users:manage_roles)
export const GET = apiRoute({ auth: 'required' }, async ({ user }) => ({ data: await councilTerms(user) }));
export const POST = apiRoute({ auth: 'required' }, async ({ user, body }) => ({ message: (await startTerm(user, body)) ?? undefined, status: 201 }));
