'use server';

import { requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { saveOrganization, setOrganizationStage, logInteraction, linkMember, unlinkMember } from '@/lib/organizations/actions';

// غلاف Server Action فقط: الهوية من الكوكي، والمنطق كله في lib/organizations/actions.ts (مشترك مع واجهة الجوّال)

export async function saveOrganizationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => saveOrganization(await requireUser(), formToObject(form)));
}

export async function setOrganizationStageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => setOrganizationStage(await requireUser(), formToObject(form)));
}

export async function logInteractionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => logInteraction(await requireUser(), formToObject(form)));
}

export async function linkMemberAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => linkMember(await requireUser(), formToObject(form)));
}

export async function unlinkMemberAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => unlinkMember(await requireUser(), formToObject(form)));
}
