import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/surface';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg p-4 pt-16">
      <Card className="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <p className="text-4xl font-bold text-brand">404</p>
        <h1 className="text-lg font-semibold">الصفحة غير موجودة</h1>
        <p className="text-sm text-muted-foreground">تأكد من الرابط، أو عد لتسجيل الدخول.</p>
        <Button asChild>
          <Link href="/login">تسجيل الدخول</Link>
        </Button>
      </Card>
    </div>
  );
}
