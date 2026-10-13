import { apiRoute, merge } from '@/lib/api/handler';
import { approveFunding } from '@/lib/funding/actions';

// اعتماد قيد (finance:approve) — لا يعتمده من سجّله (funding_four_eyes)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await approveFunding(user, merge(body, { fundingId: params.id }))) ?? undefined,
}));
