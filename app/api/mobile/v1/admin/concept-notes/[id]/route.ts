import { apiRoute, merge } from '@/lib/api/handler';
import { editConceptNote } from '@/lib/demand/actions';

// تحرير مسودة Concept Note قبل الاعتماد (concept_notes:approve)
export const PATCH = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await editConceptNote(user, merge(body, { conceptNoteId: params.id }))) ?? undefined,
}));
