import { apiRoute, merge } from '@/lib/api/handler';
import { markConceptNoteSent } from '@/lib/demand/actions';

// تعليمها مُرسلة — مرفوض دون اعتماد (§16.1)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await markConceptNoteSent(user, merge(body, { conceptNoteId: params.id }))) ?? undefined,
}));
