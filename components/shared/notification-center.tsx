import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { markAllReadAction, markReadAction, openNotificationAction } from '@/server/actions/notifications';
import { cn, formatDate, formatDateTime } from '@/lib/utils';
import { ActionForm, SubmitButton } from './action-form';
import { PulseDot } from './pulse-dot';
import { EmptyState } from './states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/surface';

// NotificationCenter — PRD §12: غير المقروء بارز · تجميع حسب اليوم · تحميل تدريجي · إشعارات المستخدم نفسه فقط.

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export function NotificationCenter({
  notifications,
  unreadCount,
  moreHref,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
  /** رابط الدفعة التالية، أو null إن لم يبق شيء */
  moreHref: string | null;
}) {
  const days = new Map<string, NotificationItem[]>();
  for (const n of notifications) {
    const day = formatDate(n.createdAt);
    days.set(day, [...(days.get(day) ?? []), n]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {unreadCount > 0 ? `${unreadCount} غير مقروءة` : 'قرأت كل إشعاراتك.'}
        </p>
        {unreadCount > 0 ? (
          <ActionForm action={markAllReadAction} hideSuccess className="gap-0">
            <SubmitButton variant="outline" size="sm">
              <CheckCheck aria-hidden />
              تعليم الكل كمقروء
            </SubmitButton>
          </ActionForm>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <EmptyState
            title="لا إشعارات بعد"
            hint="تصلك هنا الإشعارات مع كل تحديث على شكاواك: الاستلام، والتحويل للجنة، وتغيّر الحالة، والحل."
          />
        </Card>
      ) : (
        [...days].map(([day, items]) => (
          <section key={day} className="flex flex-col gap-2">
            <h2 className="text-xs font-medium text-muted-foreground">{day}</h2>
            <Card className="divide-y">
              {items.map((n) => (
                <article
                  key={n.id}
                  className={cn('flex items-start gap-3 p-3 sm:p-4', !n.readAt && 'bg-brand-soft/40')}
                  aria-label={n.readAt ? undefined : 'غير مقروء'}
                >
                  <span className="relative mt-0.5 shrink-0">
                    <Bell className={cn('size-4', n.readAt ? 'text-muted-foreground' : 'text-brand')} aria-hidden />
                    {!n.readAt ? <PulseDot className="absolute -end-1 -top-1 size-2" /> : null}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className={cn('text-sm', !n.readAt && 'font-semibold')}>{n.title}</p>
                    {n.body ? <p className="text-sm text-muted-foreground">{n.body}</p> : null}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <time dateTime={n.createdAt.toISOString()}>{formatDateTime(n.createdAt)}</time>
                      {n.link ? (
                        // يعلّمه مقروءًا ثم ينتقل لرابطه (openNotificationAction)
                        <ActionForm action={openNotificationAction} hideSuccess className="gap-0">
                          <input type="hidden" name="notificationId" value={n.id} />
                          <button type="submit" className="text-brand hover:underline">
                            افتح
                          </button>
                        </ActionForm>
                      ) : null}
                    </div>
                  </div>
                  {!n.readAt ? (
                    <ActionForm action={markReadAction} hideSuccess className="gap-0">
                      <input type="hidden" name="notificationId" value={n.id} />
                      <SubmitButton variant="ghost" size="sm" aria-label={`تعليم «${n.title}» كمقروء`}>
                        مقروء
                      </SubmitButton>
                    </ActionForm>
                  ) : null}
                </article>
              ))}
            </Card>
          </section>
        ))
      )}

      {moreHref ? (
        <Button asChild variant="outline" className="self-center">
          <Link href={moreHref} scroll={false}>
            عرض الأقدم
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
