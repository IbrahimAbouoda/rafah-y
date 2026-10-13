import { apiRoute, merge } from '@/lib/api/handler';
import { decideOffer } from '@/lib/offers/actions';

// قبول عرض دعم أو رفضه (offers:decide) — القبول لا ينشئ قيدًا ماليًا (D29)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await decideOffer(user, merge(body, { offerId: params.id }))) ?? undefined,
}));
