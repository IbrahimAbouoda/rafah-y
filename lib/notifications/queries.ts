import 'server-only';
import { db } from '@/lib/db';
import type { SessionUser } from '@/lib/rbac';

// مركز الإشعارات (§8.1). الشرط userId هو النطاق: لا يُجلب إشعار غيره أصلًا.

export async function myNotifications(user: SessionUser, range: { skip: number; take: number }) {
  const where = { userId: user.id, channel: 'IN_APP' as const };
  const [items, total, unread] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: range.skip,
      take: range.take,
      select: { id: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
    db.notification.count({ where }),
    db.notification.count({ where: { ...where, readAt: null } }),
  ]);
  return { items, total, unread };
}

/** تفضيلات البريد المحفوظة (§8.3) — تفضيلاته فقط؛ الغائب يعني مفعّلًا */
export async function myEmailPreferences(user: SessionUser) {
  return db.notificationPreference.findMany({ where: { userId: user.id, channel: 'EMAIL' }, select: { type: true, enabled: true } });
}
