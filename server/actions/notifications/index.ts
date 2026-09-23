'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { db } from '@/lib/db';
import { notFound } from '@/lib/errors';
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
