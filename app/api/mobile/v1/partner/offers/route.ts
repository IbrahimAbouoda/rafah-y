import { apiRoute } from '@/lib/api/handler';
import { partnerOffers } from '@/lib/initiatives/queries';
import { submitOffer } from '@/lib/offers/actions';

// عروض دعم مؤسساتك وتقديم عرض (offers:create بنطاق مؤسساتك — D27)
export const GET = apiRoute({ auth: 'required' }, async ({ user }) => ({ data: await partnerOffers(user) }));
export const POST = apiRoute({ auth: 'required' }, async ({ user, body }) => ({ message: (await submitOffer(user, body)) ?? undefined, status: 201 }));
