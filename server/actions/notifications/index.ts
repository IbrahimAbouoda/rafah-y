'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { markAllRead, markRead, openNotification, setEmailPreferences } from '@/lib/notifications/actions';

// غلاف Server Action فقط: المنطق في lib/notifications/actions.ts (مشترك مع واجهة الجوّال)

export async function markReadAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => markRead(await requireUser(), formToObject(form)));
}

export async function markAllReadAction(): Promise<ActionState> {
  return runAction(async () => markAllRead(await requireUser()));
}

/** «افتح»: يعلّم الإشعار مقروءًا ثم ينتقل لرابطه. */
export async function openNotificationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target = '/me/notifications';
  const result = await runAction(async () => {
    target = (await openNotification(await requireUser(), formToObject(form))) ?? target;
  });
  if (result?.ok) redirect(target);
  return result;
}

export async function setEmailPreferencesAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => setEmailPreferences(await requireUser(), form.getAll('email').map(String)));
}
