import { apiRoute, pageOf } from '@/lib/api/handler';
import { myComplaints } from '@/lib/complaints/queries';
import { submitAccountComplaint } from '@/lib/complaints/submit';

// «شكاواي» وتقديم شكوى من الحساب — AC-01 · AC-17 (clientDraftId)
export const GET = apiRoute({ auth: 'required' }, async ({ user, query }) => ({ data: await myComplaints(user, pageOf(query)) }));
export const POST = apiRoute({ auth: 'required' }, async ({ user, body }) => ({ ...(await submitAccountComplaint(user, body)), status: 201 }));
