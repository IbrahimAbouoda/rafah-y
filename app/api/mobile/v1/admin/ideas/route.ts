import { apiRoute, found, pageOf } from '@/lib/api/handler';
import { ideaReviewList } from '@/lib/ideas/queries';

// مراجعة الأفكار بنطاق ideas:review — ?status=&page=
export const GET = apiRoute({ auth: 'required' }, async ({ user, query }) => ({
  data: found(await ideaReviewList(user, query.get('status') ?? undefined, pageOf(query, 25)), 'نطاق الأفكار'),
}));
