import { mobileSession, statelessSupabase } from '@/lib/api/auth';
import { apiRoute } from '@/lib/api/handler';
import { loginFlow } from '@/lib/auth-flows';
import { db } from '@/lib/db';
import { landingPath } from '@/lib/nav';
import { loadSessionUser } from '@/lib/session';

// الدخول بالبريد أو الهاتف — حظر متضاعف بعد 5 إخفاقات (§6.4). الجلسة تعود للتطبيق ليحفظها supabase_flutter (D46).
export const POST = apiRoute({ auth: 'none' }, async ({ body }) => {
  const { userId, session } = await loginFlow(statelessSupabase(), body);
  const user = await loadSessionUser(db, userId);
  return { data: { session: mobileSession(session), landingPath: user ? landingPath(user) : '/me' } };
});
