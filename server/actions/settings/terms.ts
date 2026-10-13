'use server';

import { requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { startTerm } from '@/lib/settings/terms';

// غلاف Server Action فقط: الهوية من الكوكي، والمنطق كله في lib/settings/terms.ts (مشترك مع واجهة الجوّال)

export async function startTermAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => startTerm(await requireUser(), formToObject(form)));
}
