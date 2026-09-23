'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser, provisionUser, requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { invalid, rateLimited } from '@/lib/errors';
import { landingPath } from '@/lib/nav';
import { clearLoginFailures, limit, loginBlockedFor, recordLoginFailure } from '@/lib/rate-limit';
import { clientIp, safeNextPath } from '@/lib/request';
import { loadSessionUser } from '@/lib/session';
import { db } from '@/lib/db';
import { supabaseServer } from '@/lib/supabase/server';
import { LoginSchema, NewPasswordSchema, RegisterSchema, ResetRequestSchema } from '@/lib/validation/auth';

// مسارات المصادقة عامة بطبيعتها: لا مستخدم قبلها، فالحماية بحد المعدل لا بـ can() (PRD §6.4).

async function afterSignIn(authUserId: string, next: string | null): Promise<never> {
  const user = await loadSessionUser(db, authUserId);
  const target = next ?? (user ? landingPath(user) : '/login');
  redirect(target);
}

export async function registerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const gate = await limit('register', await clientIp());
    if (!gate.allowed) throw rateLimited(gate.retryAfterSec);
    const data = RegisterSchema.parse(formToObject(form));

    const supabase = await supabaseServer();
    const credentials =
      data.phone !== undefined
        ? { phone: data.phone, password: data.password }
        : { email: data.email, password: data.password };
    const { data: result, error } = await supabase.auth.signUp({
      ...credentials,
      options: { data: { full_name: data.fullName } },
    });

    const duplicate = error?.code === 'user_already_exists' || result.user?.identities?.length === 0;
    if (duplicate) {
      throw invalid('هذا الحساب مسجّل مسبقًا. سجّل الدخول، أو استعد كلمة المرور إن نسيتها.');
    }
    if (error?.code === 'weak_password') {
      throw invalid('كلمة المرور ضعيفة. استخدم 10 محارف على الأقل تجمع حروفًا وأرقامًا.', {
        password: ['كلمة المرور ضعيفة.'],
      });
    }
    if (error || !result.user) {
      throw invalid('تعذّر إنشاء الحساب الآن. تأكد من البيانات وأعد المحاولة بعد قليل.');
    }

    const userId = await provisionUser(result.user);
    if (result.session) await afterSignIn(userId, null);
    return 'أنشأنا حسابك. افتح الرابط الذي أرسلناه إليك لتأكيده، ثم سجّل الدخول.';
  });
}

export async function loginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const raw = formToObject(form);
    const data = LoginSchema.parse(raw);
    const who = `${await clientIp()}|${data.email ?? data.phone}`;

    const blockedFor = await loginBlockedFor(who);
    if (blockedFor > 0) throw rateLimited(blockedFor);

    const supabase = await supabaseServer();
    const { data: result, error } = await supabase.auth.signInWithPassword(
      data.phone !== undefined
        ? { phone: data.phone, password: data.password }
        : { email: data.email, password: data.password },
    );
    if (error || !result.user) {
      await recordLoginFailure(who);
      // رسالة واحدة لا تكشف إن كان الحساب موجودًا
      throw invalid('البريد أو رقم الجوّال أو كلمة المرور غير صحيحة. تحقق منها وأعد المحاولة.');
    }

    await clearLoginFailures(who);
    const userId = await provisionUser(result.user);
    await afterSignIn(userId, safeNextPath(raw.next));
  });
}

export async function logoutAction(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function requestResetAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const gate = await limit('resetPassword', await clientIp());
    if (!gate.allowed) throw rateLimited(gate.retryAfterSec);
    const { email } = ResetRequestSchema.parse(formToObject(form));

    const supabase = await supabaseServer();
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${appUrl}/reset-password/confirm` });
    // نفس الرسالة سواء وُجد الحساب أم لا
    return 'إن كان هذا البريد مسجّلًا لدينا فستصلك رسالة برابط لتعيين كلمة مرور جديدة خلال دقائق. تحقق من مجلد الرسائل غير المرغوب فيها أيضًا.';
  });
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
