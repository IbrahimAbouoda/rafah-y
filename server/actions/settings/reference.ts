'use server';

import { requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { saveCommittee, saveCategory, saveArea } from '@/lib/settings/reference';

// غلاف Server Action فقط: الهوية من الكوكي، والمنطق كله في lib/settings/reference.ts (مشترك مع واجهة الجوّال)

export async function saveCommitteeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => saveCommittee(await requireUser(), formToObject(form)));
}

export async function saveCategoryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => saveCategory(await requireUser(), formToObject(form)));
}

export async function saveAreaAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => saveArea(await requireUser(), formToObject(form)));
}
