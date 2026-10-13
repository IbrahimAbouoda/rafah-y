import { apiRoute, merge } from '@/lib/api/handler';
import { reviewIdea } from '@/lib/ideas/actions';

// فرز ← لجنة ← طلب تعديل (ideas:review)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await reviewIdea(user, merge(body, { ideaId: params.id }))) ?? undefined,
}));
