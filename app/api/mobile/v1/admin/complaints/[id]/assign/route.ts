import { apiRoute, merge } from '@/lib/api/handler';
import { assignToCommittee } from '@/lib/complaints/actions';

// UNDER_REVIEW → ASSIGNED (complaints:triage) — AC-03
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await assignToCommittee(user, merge(body, { complaintId: params.id }))) ?? undefined,
}));
