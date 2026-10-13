'use server';

import { requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { assignRole, revokeRole } from '@/lib/settings/roles';

// غلاف Server Action فقط: الهوية من الكوكي، والمنطق كله في lib/settings/roles.ts (مشترك مع واجهة الجوّال)

export async function assignRoleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => assignRole(await requireUser(), formToObject(form)));
}

export async function revokeRoleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => revokeRole(await requireUser(), formToObject(form)));
}
