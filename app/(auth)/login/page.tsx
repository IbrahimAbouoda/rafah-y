import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { landingPath } from '@/lib/nav';
import { safeNextPath } from '@/lib/request';
import { logoutAction } from '@/server/actions/auth';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surface';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'تسجيل الدخول' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; passwordChanged?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  if (user) {
    const target = safeNextPath(params.next) ?? landingPath(user);
    if (target) redirect(target);
    // مستخدم بلا بوابة بعد: بوابة الشباب /me تُفتح في Sprint 1
    return (
      <Card>
        <CardHeader>
          <CardTitle>أهلًا {user.fullName}</CardTitle>
          <CardDescription>
            حسابك جاهز. بوابة الشباب لتقديم الشكاوى والأفكار ومتابعتها ستُتاح لك قريبًا على هذا الحساب نفسه.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" className="w-full">
              تسجيل الخروج
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>تسجيل الدخول</CardTitle>
        <CardDescription>بالبريد الإلكتروني أو رقم الجوّال.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {params.passwordChanged ? <Alert tone="success">تغيّرت كلمة المرور. سجّل الدخول بها الآن.</Alert> : null}
        <LoginForm next={safeNextPath(params.next) ?? ''} />
        <div className="flex flex-col gap-1 text-center text-sm">
          <Link href="/reset-password" className="text-brand hover:underline">
            نسيت كلمة المرور؟
          </Link>
          <p className="text-muted-foreground">
            ليس لديك حساب؟{' '}
            <Link href="/register" className="text-brand hover:underline">
              أنشئ حسابًا
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
