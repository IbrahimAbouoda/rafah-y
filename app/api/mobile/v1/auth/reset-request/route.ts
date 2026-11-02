import { statelessSupabase } from '@/lib/api/auth';
import { apiRoute } from '@/lib/api/handler';
import { resetRequestFlow } from '@/lib/auth-flows';
import { appUrl } from '@/lib/config';
import { clientIp } from '@/lib/request';

// طلب رابط استعادة بالبريد (D17). الرابط يفتح صفحة الويب لتعيين كلمة المرور، ثم يعود الشاب للتطبيق (D49).
export const POST = apiRoute({ auth: 'none' }, async ({ body }) => ({
  message: await resetRequestFlow(statelessSupabase(), body, await clientIp(), appUrl()),
}));
