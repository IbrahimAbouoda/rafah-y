import { NextResponse, type NextRequest } from 'next/server';
import { provisionUser } from '@/lib/auth';
import { markRecovery } from '@/lib/rate-limit';
import { supabaseServer } from '@/lib/supabase/server';

// معالج رابط البريد (ليس صفحة): يبادل رمز الاستعادة بجلسة ثم يعيد إلى خطوة كلمة المرور الجديدة.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const target = request.nextUrl.clone();
  target.pathname = '/reset-password';
  target.search = '';

  if (code) {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // M-4: رابط البريد وحده يفتح نافذة تغيير كلمة المرور بلا الكلمة الحالية (15 دقيقة، مرة واحدة)
      await markRecovery(await provisionUser(data.user));
      target.searchParams.set('step', 'new');
      return NextResponse.redirect(target);
    }
  }
  target.searchParams.set('error', 'link');
  return NextResponse.redirect(target);
}
