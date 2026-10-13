import { apiRoute, merge } from '@/lib/api/handler';
import { closeComplaint } from '@/lib/complaints/actions';

// RESOLVED → CLOSED (complaints:close)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await closeComplaint(user, merge(body, { complaintId: params.id }))) ?? undefined,
}));
