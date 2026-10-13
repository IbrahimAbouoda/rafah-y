'use server';

import { requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { markAllRead, markRead } from '@/lib/notifications/actions';

// غلاف Server Action فقط: المنطق في lib/notifications/actions.ts (مشترك مع واجهة الجوّال)

export async function markReadAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => markRead(await requireUser(), formToObject(form)));
}

export async function markAllReadAction(): Promise<ActionState> {
  return runAction(async () => markAllRead(await requireUser()));
}
