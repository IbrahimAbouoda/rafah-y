'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { db } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { EMAIL_TYPES } from '@/lib/notifications/preferences';
import { safeNextPath } from '@/lib/request';
import { NotificationIdSchema } from '@/lib/validation/complaints';

// مركز الإشعارات — PRD §12 NotificationCenter: إشعارات المستخدم نفسه فقط. تسجيل الدخول يكفي، والنطاق هو userId.

export async function markReadAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const { notificationId } = NotificationIdSchema.parse(formToObject(form));
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
  });
}

export async function markAllReadAction(): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const { count } = await db.notification.updateMany({
      where: { userId: user.id, channel: 'IN_APP', readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath('/me/notifications');
    return count > 0 ? `عُلّمت ${count} إشعارات كمقروءة.` : 'لا إشعارات غير مقروءة.';
  });
}

/** «افتح»: يعلّم الإشعار مقروءًا ثم ينتقل لرابطه. الرابط داخلي نسبي فقط — غير ذلك يعود لمركز الإشعارات. */
export async function openNotificationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target = '/me/notifications';
  const result = await runAction(async () => {
    const user = await requireUser();
    const { notificationId } = NotificationIdSchema.parse(formToObject(form));
    const n = await db.notification.findFirst({
      where: { id: notificationId, userId: user.id, channel: 'IN_APP' },
      select: { id: true, link: true, readAt: true },
    });
    if (!n) throw notFound('الإشعار');
    if (!n.readAt) await db.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
    target = safeNextPath(n.link) ?? target;
  });
  if (result?.ok) redirect(target);
  return result;
}

/**
 * notifications/setPreference — تفضيلات البريد لكل نوع (§8.3). تفضيلاته فقط: الشرط userId هو النطاق.
 * النموذج يرسل خانة لكل نوع بريد؛ الغائبة = أُوقفت. داخل المنصة لا تفضيل له.
 */
export async function setEmailPreferencesAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const on = new Set(form.getAll('email').map(String));
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
  });
}
