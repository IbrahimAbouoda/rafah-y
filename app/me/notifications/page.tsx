import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { guardPage } from '@/lib/page-guard';
import { NotificationCenter } from '@/components/shared/notification-center';
import { PageHeader } from '@/components/shared/page-header';

export const metadata: Metadata = { title: 'الإشعارات' };

const BATCH = 30;
const MAX = 300;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const params = await searchParams;
  const { user } = await guardPage('/me/notifications', null);
  const take = Math.min(MAX, Math.max(BATCH, Number(params.n) || BATCH));

  // الشرط userId هو النطاق: لا يُجلب إشعار غيره أصلًا
  const where = { userId: user.id, channel: 'IN_APP' as const };
  const [notifications, total, unread] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
    db.notification.count({ where }),
    db.notification.count({ where: { ...where, readAt: null } }),
  ]);

  return (
    <>
      <PageHeader title="الإشعارات" description="تحديثات شكاواك وما يخصّك في المنصة. من لديه بريد تصله الأحداث المهمة بريديًا أيضًا." />
      <NotificationCenter
        notifications={notifications}
        unreadCount={unread}
        moreHref={total > take && take < MAX ? `/me/notifications?n=${take + BATCH}` : null}
      />
    </>
  );
}
