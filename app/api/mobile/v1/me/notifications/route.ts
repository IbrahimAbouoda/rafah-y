import { apiRoute, pageOf } from '@/lib/api/handler';
import { myNotifications } from '@/lib/notifications/queries';

// مركز الإشعارات (§8.1) — ?page=&pageSize=
export const GET = apiRoute({ auth: 'required' }, async ({ user, query }) => {
  const p = pageOf(query, 30);
  const { items, total, unread } = await myNotifications(user, { skip: (p.page - 1) * p.pageSize, take: p.pageSize });
  return { data: { items, total, unread, ...p } };
});
