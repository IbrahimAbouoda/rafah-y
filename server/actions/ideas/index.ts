'use server';

import { requireUser } from '@/lib/auth';
import { formToObject, runAction, runActionData, type ActionState, type DataState } from '@/lib/action';
import { submitIdea, reviseIdea, voteIdea, reviewIdea, mergeIdea, decideIdea, type SubmittedIdea } from '@/lib/ideas/actions';

// غلاف Server Action فقط: الهوية من الكوكي، والمنطق كله في lib/ideas/actions.ts (مشترك مع واجهة الجوّال)

export async function submitIdeaAction(input: unknown): Promise<DataState<SubmittedIdea>> {
  return runActionData(async () => submitIdea(await requireUser(), input));
}

export async function reviseIdeaAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => reviseIdea(await requireUser(), formToObject(form)));
}

export async function voteIdeaAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => voteIdea(await requireUser(), formToObject(form)));
}

export async function reviewIdeaAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => reviewIdea(await requireUser(), formToObject(form)));
}

export async function mergeIdeaAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => mergeIdea(await requireUser(), formToObject(form)));
}

export async function decideIdeaAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => decideIdea(await requireUser(), formToObject(form)));
}
