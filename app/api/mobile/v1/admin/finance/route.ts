import { apiRoute } from '@/lib/api/handler';
import { financeLedger } from '@/lib/finance/queries';
import { recordFunding } from '@/lib/funding/actions';

// السجل المالي (finance:read) وتسجيل قيد (finance:record)
export const GET = apiRoute({ auth: 'required' }, async ({ user }) => ({ data: await financeLedger(user) }));
export const POST = apiRoute({ auth: 'required' }, async ({ user, body }) => ({ message: (await recordFunding(user, body)) ?? undefined, status: 201 }));
