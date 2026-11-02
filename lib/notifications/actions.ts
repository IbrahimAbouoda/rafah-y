import 'server-only';
import type { SessionUser } from '@/lib/rbac';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { EMAIL_TYPES } from '@/lib/notifications/preferences';
import { safeNextPath } from '@/lib/request';
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

/** يعلّم الإشعار مقروءًا ويعيد رابطه إن كان داخليًا نسبيًا — غير ذلك null فيبقى المستخدم في مركز الإشعارات. */
export async function openNotification(user: SessionUser, input: unknown): Promise<string | null> {
  const { notificationId } = NotificationIdSchema.parse(input);
  const n = await db.notification.findFirst({
    where: { id: notificationId, userId: user.id, channel: 'IN_APP' },
    select: { id: true, link: true, readAt: true },
  });
  if (!n) throw notFound('الإشعار');
  if (!n.readAt) await db.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
  return safeNextPath(n.link);
}

/**
 * notifications/setPreference — تفضيلات البريد لكل نوع (§8.3). تفضيلاته فقط: الشرط userId هو النطاق.
 * `enabled` الأنواع المفعّلة؛ الغائب = أُوقف. داخل المنصة لا تفضيل له.
 */
export async function setEmailPreferences(user: SessionUser, enabled: string[]): Promise<string> {
  const on = new Set(enabled);
  await db.$transaction(
    EMAIL_TYPES.map((type) =>
      db.notificationPreference.upsert({
        where: { userId_type_channel: { userId: user.id, type, channel: 'EMAIL' } },
        create: { userId: user.id, type, channel: 'EMAIL', enabled: on.has(type) },
        update: { enabled: on.has(type) },
      }),
    ),
  );
  revalidatePath('/me/notifications');
  return 'حُفظت تفضيلات البريد. إشعارات المنصة تبقى كما هي.';
}
