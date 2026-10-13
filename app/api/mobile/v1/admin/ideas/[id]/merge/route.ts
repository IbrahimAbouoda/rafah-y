import { apiRoute, merge } from '@/lib/api/handler';
import { mergeIdea } from '@/lib/ideas/actions';

// دمج فكرة في أخرى (ideas:merge)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await mergeIdea(user, merge(body, { ideaId: params.id }))) ?? undefined,
}));
