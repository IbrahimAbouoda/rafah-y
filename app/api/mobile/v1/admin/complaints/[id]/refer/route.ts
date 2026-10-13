import { apiRoute, merge } from '@/lib/api/handler';
import { referComplaint } from '@/lib/complaints/actions';

// COMMITTEE_REVIEW → REFERRED (complaints:refer)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await referComplaint(user, merge(body, { complaintId: params.id }))) ?? undefined,
}));
