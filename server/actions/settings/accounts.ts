'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission, requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { logError } from '@/lib/log';
import { supabaseServer } from '@/lib/supabase/server';
import { eraseUser, type EraseResult } from '@/lib/users/erase';
import { AnonymizeUserSchema, DeleteMyAccountSchema } from '@/lib/validation/settings';

// محو الحساب — Sprint 6 · Q13 (قرار 2026-09-30). المنطق كله في lib/users/erase.ts.
// لا واجهة بعدُ (قرار 2026-09-30): الإجراءان جاهزان ومختبَران، وموضع الأزرار يُقرَّر لاحقًا.

const outcome = (r: EraseResult, who: string) =>
  (r.mode === 'deleted'
    ? `حُذف ${who} نهائيًا: لم يكن له أي أثر في سجلات المجلس.`
    : `جُهِّل ${who}: حُذفت بياناته الشخصية وعُطِّل، وبقيت سجلاته بلا صاحب معروف.`) +
  (r.authDeleted ? '' : ' تعذّر حذف هوية الدخول من Supabase — احذفها يدويًا من لوحة Auth (الحساب معطَّل في المنصة على أي حال).');

/** الشاب يمحو حسابه بنفسه: الهدف دائمًا صاحب الجلسة، فلا معرّف يُمرَّر ولا يُقارَن */
export async function deleteMyAccountAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    DeleteMyAccountSchema.parse(formToObject(form));

    // actor = null: سطر التدقيق لا يشير إلى حساب قد يُحذف فعليًا (source = self)
    const result = await eraseUser(user.id, null);
    try {
      await (await supabaseServer()).auth.signOut();
    } catch (e) {
      logError('erase-signout', e);
    }
    return outcome(result, 'حسابك');
  });
}

/** مدير الحسابات يمحو حساب غيره — users:manage_roles (قرار 2026-09-30: من يعيّن الأدوار يدير الحسابات) */
export async function anonymizeUserAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'users:manage_roles');
    const data = AnonymizeUserSchema.parse(formToObject(form));
    requirePermission(user, 'users:manage_roles', {});

    const result = await eraseUser(data.userId, user);
    revalidatePath('/admin/settings/users');
    return outcome(result, 'الحساب');
  });
}
