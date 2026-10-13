import { apiRoute } from '@/lib/api/handler';
import { myComplaintCounts } from '@/lib/complaints/queries';
import { unreadCount } from '@/lib/shell';

// لوحة الشاب: عدّادات شكاواه باسمه والإشعارات غير المقروءة
export const GET = apiRoute({ auth: 'required' }, async ({ user }) => {
  const [complaints, unread] = await Promise.all([myComplaintCounts(user.id), unreadCount(user.id)]);
  return { data: { complaints, unread } };
});
