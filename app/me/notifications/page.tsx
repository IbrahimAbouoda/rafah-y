import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { guardPage } from '@/lib/page-guard';
import { disabledSet } from '@/lib/notifications/preferences';
import { EmailPreferences } from '@/components/notifications/email-preferences';
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
  const [notifications, total, unread, prefs] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
    db.notification.count({ where }),
    db.notification.count({ where: { ...where, readAt: null } }),
    db.notificationPreference.findMany({ where: { userId: user.id, channel: 'EMAIL' }, select: { type: true, enabled: true } }),
  ]);

  return (
    <>
      <PageHeader title="الإشعارات" description="تحديثات شكاواك وما يخصّك في المنصة. من لديه بريد تصله الأحداث المهمة بريديًا أيضًا." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <NotificationCenter
          notifications={notifications}
          unreadCount={unread}
          moreHref={total > take && take < MAX ? `/me/notifications?n=${take + BATCH}` : null}
        />
        <div className="lg:sticky lg:top-20 lg:self-start">
          <EmailPreferences disabled={disabledSet(prefs)} email={user.email} />
        </div>
      </div>
    </>
  );
}
