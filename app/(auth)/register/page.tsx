import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surface';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'إنشاء حساب' };

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>إنشاء حساب</CardTitle>
        <CardDescription>
          نطلب اسمك وطريقة دخول فقط. لا رقم هوية ولا عنوان ولا تاريخ ميلاد.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <RegisterForm />
        <p className="text-center text-sm text-muted-foreground">
          لديك حساب؟{' '}
          <Link href="/login" className="text-brand hover:underline">
            سجّل الدخول
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
