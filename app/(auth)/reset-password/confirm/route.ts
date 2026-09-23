import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

// معالج رابط البريد (ليس صفحة): يبادل رمز الاستعادة بجلسة ثم يعيد إلى خطوة كلمة المرور الجديدة.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const target = request.nextUrl.clone();
  target.pathname = '/reset-password';
  target.search = '';

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      target.searchParams.set('step', 'new');
      return NextResponse.redirect(target);
    }
  }
  target.searchParams.set('error', 'link');
  return NextResponse.redirect(target);
}
