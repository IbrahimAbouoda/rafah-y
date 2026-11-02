'use server';

import { requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { recordFunding, approveFunding, updateFunding, deleteFunding } from '@/lib/funding/actions';

// غلاف Server Action فقط: الهوية من الكوكي، والمنطق كله في lib/funding/actions.ts (مشترك مع واجهة الجوّال)

export async function recordFundingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => recordFunding(await requireUser(), formToObject(form)));
}

export async function updateFundingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => updateFunding(await requireUser(), formToObject(form)));
}

export async function deleteFundingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => deleteFunding(await requireUser(), formToObject(form)));
}

export async function approveFundingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => approveFunding(await requireUser(), formToObject(form)));
}
