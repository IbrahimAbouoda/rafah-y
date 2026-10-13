import { apiRoute, found, pageOf } from '@/lib/api/handler';
import { complaintList } from '@/lib/complaints/queries';

// قائمة الشكاوى بنطاق complaints:read — ?q=&status=&committee=&page=
export const GET = apiRoute({ auth: 'required' }, async ({ user, query }) => ({
  data: found(
    await complaintList(
      user,
      { q: query.get('q') ?? undefined, status: query.get('status') ?? undefined, committee: query.get('committee') ?? undefined },
      pageOf(query, 25),
    ),
    'نطاق الشكاوى',
  ),
}));
