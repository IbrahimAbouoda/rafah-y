import { apiRoute, pageOf } from '@/lib/api/handler';
import { publicIdeas } from '@/lib/ideas/queries';

// الأفكار العامة — D28: من SCREENING فصاعدًا وبلا اسم. الرمز اختياري: يحدد حالة زر التصويت فقط
export const GET = apiRoute({ auth: 'optional' }, async ({ user, query }) => ({
  data: await publicIdeas(
    user,
    { status: query.get('status') ?? undefined, committee: query.get('committee') ?? undefined, area: query.get('area') ?? undefined, sort: query.get('sort') ?? undefined },
    pageOf(query),
  ),
}));
