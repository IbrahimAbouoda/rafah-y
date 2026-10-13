import { apiRoute, merge } from '@/lib/api/handler';
import { decideIdea } from '@/lib/ideas/actions';

// اعتماد أو رفض (ideas:approve) — AC-08
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await decideIdea(user, merge(body, { ideaId: params.id }))) ?? undefined,
}));
