'use server';

import { requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { openForTriage, assignToCommittee, updateStatus, referComplaint, closeComplaint, dismissComplaint } from '@/lib/complaints/actions';

// غلاف Server Action فقط: الهوية من الكوكي، والمنطق كله في lib/complaints/actions.ts (مشترك مع واجهة الجوّال)

export async function openForTriageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => openForTriage(await requireUser(), formToObject(form)));
}

export async function assignToCommitteeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => assignToCommittee(await requireUser(), formToObject(form)));
}

export async function updateStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => updateStatus(await requireUser(), formToObject(form)));
}

export async function referComplaintAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => referComplaint(await requireUser(), formToObject(form)));
}

export async function closeComplaintAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => closeComplaint(await requireUser(), formToObject(form)));
}

export async function dismissComplaintAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => dismissComplaint(await requireUser(), formToObject(form)));
}
