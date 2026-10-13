'use server';

import { requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { createPoll, setThreshold, demandVote, editConceptNote, approveConceptNote, markConceptNoteSent } from '@/lib/demand/actions';

// غلاف Server Action فقط: الهوية من الكوكي، والمنطق كله في lib/demand/actions.ts (مشترك مع واجهة الجوّال)

export async function createPollAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => createPoll(await requireUser(), formToObject(form)));
}

export async function setThresholdAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => setThreshold(await requireUser(), formToObject(form)));
}

export async function demandVoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => demandVote(await requireUser(), formToObject(form)));
}

export async function editConceptNoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => editConceptNote(await requireUser(), formToObject(form)));
}

export async function approveConceptNoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => approveConceptNote(await requireUser(), formToObject(form)));
}

export async function markConceptNoteSentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => markConceptNoteSent(await requireUser(), formToObject(form)));
}
