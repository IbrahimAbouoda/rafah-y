'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser, requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { invalid, rateLimited } from '@/lib/errors';
import { landingPath } from '@/lib/nav';
import { createClient } from '@supabase/supabase-js';
import { consumeRecovery, loginBlockedFor, recordLoginFailure, recoveryActive } from '@/lib/rate-limit';
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
    const { userId } = await loginFlow(await supabaseServer(), raw);
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

/**
 * يتحقق من كلمة المرور الحالية بعميل لا يحفظ جلسة ولا يلمس كوكيز الطلب، ثم يُنهي الجلسة المؤقتة التي أنشأها.
 * الإخفاق يُعدّ في عدّاد الحساب نفسه مع تسجيل الدخول (M-3)، فلا تصير هذه الخانة طريقًا لتخمين كلمة المرور.
 */
async function verifyCurrentPassword(identity: { email: string | null; phone: string | null }, password: string): Promise<void> {
  const who = `account:${(identity.email ?? identity.phone ?? '').toLowerCase()}`;
  const blockedFor = await loginBlockedFor(who);
  if (blockedFor > 0) throw rateLimited(blockedFor);
  const probe = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await probe.auth.signInWithPassword(
    identity.email ? { email: identity.email, password } : { phone: identity.phone ?? '', password },
  );
  if (error) {
    await recordLoginFailure(who);
    throw invalid('كلمة المرور الحالية غير صحيحة.', { currentPassword: ['كلمة المرور الحالية غير صحيحة.'] });
  }
  await probe.auth.signOut({ scope: 'local' });
}

/**
 * M-4: تغيير كلمة المرور. داخل نافذة رابط الاستعادة (15 دقيقة، مرة واحدة) بلا الكلمة الحالية؛
 * وخارجها تُطلب الكلمة الحالية — جلسة مسروقة وحدها لا تغيّر كلمة المرور ولا تطرد صاحبها.
 */
export async function setNewPasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const current = await requireUser();
    const { currentPassword, password } = NewPasswordSchema.parse(formToObject(form));
    const recovering = await recoveryActive(current.id);
    if (!recovering) {
      if (!currentPassword) {
        throw invalid('اكتب كلمة المرور الحالية، أو اطلب رابط استعادة جديدًا إن نسيتها.', {
          currentPassword: ['اكتب كلمة المرور الحالية.'],
        });
      }
      await verifyCurrentPassword(current, currentPassword);
    }
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.updateUser({ password });
    if (error?.code === 'same_password') {
      throw invalid('اختر كلمة مرور مختلفة عن السابقة.', { password: ['مطابقة لكلمة المرور السابقة.'] });
    }
    if (error) throw invalid('تعذّر حفظ كلمة المرور. اطلب رابط استعادة جديدًا وأعد المحاولة.');
    if (recovering) await consumeRecovery(current.id);
    // إبطال كل الجلسات الأخرى عند تغيير كلمة المرور (PRD §6.1)
    await supabase.auth.signOut({ scope: 'others' });
    const user = await getCurrentUser();
    redirect(user ? landingPath(user) : '/login?passwordChanged=1');
  });
}
