'use server';

import { requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { createTask, reassignTask, moveTask, approveTask, commentTask } from '@/lib/tasks/actions';

// غلاف Server Action فقط: الهوية من الكوكي، والمنطق كله في lib/tasks/actions.ts (مشترك مع واجهة الجوّال)

export async function createTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => createTask(await requireUser(), formToObject(form)));
}

export async function reassignTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => reassignTask(await requireUser(), formToObject(form)));
}

export async function moveTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => moveTask(await requireUser(), formToObject(form)));
}

export async function approveTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => approveTask(await requireUser(), formToObject(form)));
}

export async function commentTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => commentTask(await requireUser(), formToObject(form)));
}
