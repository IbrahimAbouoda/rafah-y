import { apiRoute, merge } from '@/lib/api/handler';
import { approveConceptNote } from '@/lib/demand/actions';

// اعتماد بشري مسجّل للمسودة (concept_notes:approve)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await approveConceptNote(user, merge(body, { conceptNoteId: params.id }))) ?? undefined,
}));
