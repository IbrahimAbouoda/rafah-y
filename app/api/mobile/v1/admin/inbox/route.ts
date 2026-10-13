import { apiRoute, pageOf } from '@/lib/api/handler';
import { complaintInbox } from '@/lib/complaints/queries';

// صندوق الوارد — قسم الشكاوى (complaints:triage)
export const GET = apiRoute({ auth: 'required' }, async ({ user, query }) => ({ data: await complaintInbox(user, pageOf(query, 25)) }));
