import { apiRoute, merge } from '@/lib/api/handler';
import { openForTriage } from '@/lib/complaints/actions';

// SUBMITTED → UNDER_REVIEW (complaints:triage)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await openForTriage(user, merge(body, { complaintId: params.id }))) ?? undefined,
}));
