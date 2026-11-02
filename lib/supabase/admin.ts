import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// عميل Supabase بمفتاح الخدمة — للخادم فقط (SUPABASE_SERVICE_ROLE_KEY لا يبدأ بـ NEXT_PUBLIC_ — §6.10).
// يستعمله التخزين (lib/storage.ts) وحذف هوية الدخول عند محو الحساب (lib/users/erase.ts).

const globalForAdmin = globalThis as unknown as { supabaseAdmin?: SupabaseClient };

export function supabaseAdmin(): SupabaseClient {
  if (!globalForAdmin.supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    globalForAdmin.supabaseAdmin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return globalForAdmin.supabaseAdmin;
}

/**
 * يحذف هوية الدخول من Supabase Auth: كلمة المرور وكل رموز التحديث تسقط معها.
 * رمز الوصول القائم يبقى صالحًا حتى انتهائه، لكن التطبيق يرفضه لأن الحساب غير فعّال (loadSessionUser).
 * الهوية المحذوفة أصلًا نجاح (إعادة التشغيل آمنة).
 */
export async function deleteAuthIdentity(authId: string): Promise<void> {
  const { error } = await supabaseAdmin().auth.admin.deleteUser(authId);
  if (error && error.status !== 404) throw error;
}
