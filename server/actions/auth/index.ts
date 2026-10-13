'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser, requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { invalid } from '@/lib/errors';
import { landingPath } from '@/lib/nav';
import { clientIp, safeNextPath } from '@/lib/request';
import { loadSessionUser } from '@/lib/session';
import { db } from '@/lib/db';
import { supabaseServer } from '@/lib/supabase/server';
import { NewPasswordSchema } from '@/lib/validation/auth';
import { loginFlow, registerFlow, resetRequestFlow } from '@/lib/auth-flows';
import { appUrl } from '@/lib/config';

// مسارات المصادقة عامة بطبيعتها: لا مستخدم قبلها، فالحماية بحد المعدل لا بـ can() (PRD §6.4).
// المنطق في lib/auth-flows.ts (مشترك مع الجوّال)؛ هنا الكوكي وإعادة التوجيه فقط.

async function afterSignIn(authUserId: string, next: string | null): Promise<never> {
  const user = await loadSessionUser(db, authUserId);
  const target = next ?? (user ? landingPath(user) : '/login');
  redirect(target);
}

export async function registerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { userId, session, message } = await registerFlow(await supabaseServer(), formToObject(form), await clientIp());
    if (session) await afterSignIn(userId, null);
    return message;
  });
}

export async function loginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const raw = formToObject(form);
    const { userId } = await loginFlow(await supabaseServer(), raw, await clientIp());
    await afterSignIn(userId, safeNextPath(raw.next));
  });
}

export async function logoutAction(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function requestResetAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => resetRequestFlow(await supabaseServer(), formToObject(form), await clientIp(), appUrl()));
}

export async function setNewPasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireUser();
    const { password } = NewPasswordSchema.parse(formToObject(form));
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.updateUser({ password });
    if (error?.code === 'same_password') {
      throw invalid('اختر كلمة مرور مختلفة عن السابقة.', { password: ['مطابقة لكلمة المرور السابقة.'] });
    }
    if (error) throw invalid('تعذّر حفظ كلمة المرور. اطلب رابط استعادة جديدًا وأعد المحاولة.');
    // إبطال كل الجلسات الأخرى عند تغيير كلمة المرور (PRD §6.1)
    await supabase.auth.signOut({ scope: 'others' });
    const user = await getCurrentUser();
    redirect(user ? landingPath(user) : '/login?passwordChanged=1');
  });
}
