import type { Metadata } from 'next';
import { guardPage } from '@/lib/page-guard';
import { NotificationCenter } from '@/components/shared/notification-center';
import { PageHeader } from '@/components/shared/page-header';
import { myNotifications } from '@/lib/notifications/queries';

export const metadata: Metadata = { title: 'الإشعارات' };

const BATCH = 30;
const MAX = 300;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const params = await searchParams;
  const { user } = await guardPage('/me/notifications', null);
  const take = Math.min(MAX, Math.max(BATCH, Number(params.n) || BATCH));

  // الشرط userId هو النطاق: لا يُجلب إشعار غيره أصلًا
  const { items: notifications, total, unread } = await myNotifications(user, { skip: 0, take });

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
