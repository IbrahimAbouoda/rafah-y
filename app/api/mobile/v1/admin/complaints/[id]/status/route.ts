import { apiRoute, merge } from '@/lib/api/handler';
import { updateStatus } from '@/lib/complaints/actions';

// انتقالات complaints:update_status — AC-04
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await updateStatus(user, merge(body, { complaintId: params.id }))) ?? undefined,
}));
