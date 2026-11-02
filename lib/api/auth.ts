import 'server-only';
import { createClient, type Session } from '@supabase/supabase-js';
import { sessionFromAuthUser } from '@/lib/auth';
import type { SessionUser } from '@/lib/rbac';
import { supabaseEnv } from '@/lib/supabase/server';

// الجوّال لا يحمل كوكي: يرسل رمز وصول Supabase في Authorization: Bearer (D44 · D46).
// الخادم يتحقق منه عند Supabase ثم يمرّ بالمسار نفسه للويب: provisionUser ← loadSessionUser.

export function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

/** عميل Supabase بلا كوكي ولا تخزين — لكل طلب جوّال عميله */
export function statelessSupabase() {
  const { url, key } = supabaseEnv();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

/** الجلسة كما يحتاجها supabase_flutter ليحفظها ويجدّدها — لا شيء غيرها */
export function mobileSession(session: Session | null) {
  if (!session) return null;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? null,
    tokenType: session.token_type,
  };
}

/** null ⇒ بلا رمز، أو رمز منتهٍ أو مزوّر، أو حساب معطّل. */
export async function userFromRequest(req: Request): Promise<SessionUser | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const { data } = await statelessSupabase().auth.getUser(token);
  if (!data.user) return null;
  return sessionFromAuthUser(data.user);
}
