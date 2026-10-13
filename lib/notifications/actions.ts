import 'server-only';
import type { SessionUser } from '@/lib/rbac';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { NotificationIdSchema } from '@/lib/validation/complaints';

// مركز الإشعارات — PRD §12 NotificationCenter: إشعارات المستخدم نفسه فقط. تسجيل الدخول يكفي، والنطاق هو userId.

export async function markRead(user: SessionUser, input: unknown): Promise<string | void> {
  const { notificationId } = NotificationIdSchema.parse(input);
  // الشرط على userId هو فحص الملكية: إشعار غيره = غير موجود
  const { count } = await db.notification.updateMany({
    where: { id: notificationId, userId: user.id, channel: 'IN_APP', readAt: null },
    data: { readAt: new Date() },
  });
  if (count === 0) {
    const mine = await db.notification.count({ where: { id: notificationId, userId: user.id } });
    if (!mine) throw notFound('الإشعار');
  }
  revalidatePath('/me/notifications');
  return 'عُلّم كمقروء.';
}
export async function markAllRead(user: SessionUser): Promise<string> {
  {
    const { count } = await db.notification.updateMany({
      where: { userId: user.id, channel: 'IN_APP', readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath('/me/notifications');
    return count > 0 ? `عُلّمت ${count} إشعارات كمقروءة.` : 'لا إشعارات غير مقروءة.';
  }
}
