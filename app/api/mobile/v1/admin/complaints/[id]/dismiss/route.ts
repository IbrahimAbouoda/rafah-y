import { apiRoute, merge } from '@/lib/api/handler';
import { dismissComplaint } from '@/lib/complaints/actions';

// UNDER_REVIEW → DISMISSED بسبب مكتوب (complaints:close)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await dismissComplaint(user, merge(body, { complaintId: params.id }))) ?? undefined,
}));
