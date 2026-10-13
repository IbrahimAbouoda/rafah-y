'use server';

import { requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { saveInitiative, setInitiativeStatus, updateProgress, upsertNeed, removeNeed, postUpdate } from '@/lib/initiatives/actions';

// غلاف Server Action فقط: الهوية من الكوكي، والمنطق كله في lib/initiatives/actions.ts (مشترك مع واجهة الجوّال)

export async function saveInitiativeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => saveInitiative(await requireUser(), formToObject(form)));
}

export async function setInitiativeStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => setInitiativeStatus(await requireUser(), formToObject(form)));
}

export async function updateProgressAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => updateProgress(await requireUser(), formToObject(form)));
}

export async function upsertNeedAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => upsertNeed(await requireUser(), formToObject(form)));
}

export async function removeNeedAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => removeNeed(await requireUser(), formToObject(form)));
}

export async function postUpdateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => postUpdate(await requireUser(), formToObject(form)));
}
