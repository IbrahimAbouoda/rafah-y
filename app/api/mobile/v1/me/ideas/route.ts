import { apiRoute } from '@/lib/api/handler';
import { submitIdea } from '@/lib/ideas/actions';
import { myIdeas } from '@/lib/ideas/queries';

// «أفكاري» وتقديم فكرة — idempotent على clientDraftId (§7)
export const GET = apiRoute({ auth: 'required' }, async ({ user }) => ({ data: await myIdeas(user) }));
export const POST = apiRoute({ auth: 'required' }, async ({ user, body }) => ({ ...(await submitIdea(user, body)), status: 201 }));
