import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { sessionFromAuthUser } from '@/lib/auth';
import type { SessionUser } from '@/lib/rbac';
import { supabaseEnv } from '@/lib/supabase/server';

// الجوّال لا يحمل كوكي: يرسل رمز وصول Supabase في Authorization: Bearer (D31 · D33).
// الخادم يتحقق منه عند Supabase ثم يمرّ بالمسار نفسه للويب: provisionUser ← loadSessionUser.

export function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

/** null ⇒ بلا رمز، أو رمز منتهٍ أو مزوّر، أو حساب معطّل. */
export async function userFromRequest(req: Request): Promise<SessionUser | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const { url, key } = supabaseEnv();
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) return null;
  return sessionFromAuthUser(data.user);
}
