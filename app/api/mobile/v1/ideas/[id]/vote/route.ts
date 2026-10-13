import { apiRoute, merge } from '@/lib/api/handler';
import { voteIdea } from '@/lib/ideas/actions';

// تصويت على فكرة — صوت واحد لكل حساب (ideas:vote)
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await voteIdea(user, merge(body, { ideaId: params.id }))) ?? undefined,
}));
