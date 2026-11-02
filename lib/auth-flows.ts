import 'server-only';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { provisionUser } from '@/lib/auth';
import { invalid, rateLimited } from '@/lib/errors';
import { clearLoginFailures, limit, loginBlockedFor, recordLoginFailure } from '@/lib/rate-limit';
import { LoginSchema, RegisterSchema, ResetRequestSchema } from '@/lib/validation/auth';

// مسارات المصادقة عامة بطبيعتها: لا مستخدم قبلها، فالحماية بحد المعدل لا بـ can() (PRD §6.4).
// مشتركة بين الويب (عميل Supabase بالكوكي) والجوّال (عميل بلا تخزين، والجلسة تعود للتطبيق) — D46.

type Auth = Pick<SupabaseClient, 'auth'>;

export type SignedIn = { userId: string; session: Session | null };

export async function registerFlow(supabase: Auth, input: unknown, ip: string): Promise<SignedIn & { message: string }> {
  const gate = await limit('register', ip);
  if (!gate.allowed) throw rateLimited(gate.retryAfterSec);
  const data = RegisterSchema.parse(input);

  const credentials =
    data.phone !== undefined ? { phone: data.phone, password: data.password } : { email: data.email, password: data.password };
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
  return {
    userId,
    session: result.session,
    message: result.session
      ? 'أنشأنا حسابك، وسجّلنا دخولك.'
      : 'أنشأنا حسابك. افتح الرابط الذي أرسلناه إليك لتأكيده، ثم سجّل الدخول.',
  };
}

/** §6.4: بعد 5 إخفاقات حظر يتضاعف. رسالة واحدة لا تكشف إن كان الحساب موجودًا. */
export async function loginFlow(supabase: Auth, input: unknown): Promise<SignedIn> {
  const data = LoginSchema.parse(input);
  // M-3: العدّاد على الحساب نفسه لا على IP+الحساب — تزوير IP كان يعطي عدّادًا جديدًا مع كل طلب.
  // الحظر تصاعدي مؤقت (1، 2، 4… دقائق بحد 60) لا قفل دائم، فلا يُقفل صاحب الحساب طويلًا بمحاولات غيره.
  const who = `account:${(data.email ?? data.phone ?? '').toLowerCase()}`;

  const blockedFor = await loginBlockedFor(who);
  if (blockedFor > 0) throw rateLimited(blockedFor);

  const { data: result, error } = await supabase.auth.signInWithPassword(
    data.phone !== undefined ? { phone: data.phone, password: data.password } : { email: data.email, password: data.password },
  );
  if (error || !result.user) {
    await recordLoginFailure(who);
    throw invalid('البريد أو رقم الجوّال أو كلمة المرور غير صحيحة. تحقق منها وأعد المحاولة.');
  }

  await clearLoginFailures(who);
  const userId = await provisionUser(result.user);
  return { userId, session: result.session };
}

/** D17: الاستعادة بالبريد فقط. الرابط يفتح صفحة الويب لتعيين كلمة المرور (D49 للجوّال). */
export async function resetRequestFlow(supabase: Auth, input: unknown, ip: string, appUrl: string): Promise<string> {
  const gate = await limit('resetPassword', ip);
  if (!gate.allowed) throw rateLimited(gate.retryAfterSec);
  const { email } = ResetRequestSchema.parse(input);
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${appUrl}/reset-password/confirm` });
  // نفس الرسالة سواء وُجد الحساب أم لا
  return 'إن كان هذا البريد مسجّلًا لدينا فستصلك رسالة برابط لتعيين كلمة مرور جديدة خلال دقائق. تحقق من مجلد الرسائل غير المرغوب فيها أيضًا.';
}
