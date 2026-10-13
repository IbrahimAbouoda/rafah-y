import { mobileSession, statelessSupabase } from '@/lib/api/auth';
import { apiRoute } from '@/lib/api/handler';
import { registerFlow } from '@/lib/auth-flows';
import { clientIp } from '@/lib/request';

// إنشاء حساب شاب (دور التسجيل الذاتي) — قواعد كلمة المرور وحد المعدل على الخادم. session = null ⇒ ينتظر تأكيد البريد.
export const POST = apiRoute({ auth: 'none' }, async ({ body }) => {
  const { session, message } = await registerFlow(statelessSupabase(), body, await clientIp());
  return { data: { session: mobileSession(session) }, message, status: 201 };
});
