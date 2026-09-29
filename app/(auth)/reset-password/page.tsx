import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { recoveryActive } from '@/lib/rate-limit';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surface';
import { NewPasswordForm, RequestResetForm } from './forms';

export const metadata: Metadata = { title: 'استعادة كلمة المرور' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; error?: string }>;
}) {
  const { step, error } = await searchParams;
  // الخطوة الثانية: رابط البريد أنشأ جلسة استعادة عبر /reset-password/confirm
  const user = step === 'new' ? await getCurrentUser() : null;

  if (user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>كلمة مرور جديدة</CardTitle>
          <CardDescription>بعد الحفظ تُغلق جلساتك على الأجهزة الأخرى.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewPasswordForm requireCurrent={!(await recoveryActive(user.id))} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>استعادة كلمة المرور</CardTitle>
        <CardDescription>نرسل رابط الاستعادة إلى بريدك الإلكتروني.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <Alert tone="danger">انتهت صلاحية رابط الاستعادة أو استُخدم من قبل. اطلب رابطًا جديدًا.</Alert>
        ) : null}
        <RequestResetForm />
        <Alert tone="info">
          سجّلت برقم الجوّال؟ الاستعادة بالرسائل النصية غير متاحة حاليًا. تواصل مع أمانة سر المجلس لإعادة ضبط حسابك.
        </Alert>
        <Link href="/login" className="text-center text-sm text-brand hover:underline">
          العودة لتسجيل الدخول
        </Link>
      </CardContent>
    </Card>
  );
}
