'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/surface';

/** لمكوّنات error.tsx — لا رسالة تقنية خام، ومسار خروج واضح (DoD 6) */
export function ErrorState({ reset, title = 'تعذّر تحميل هذه الصفحة' }: { reset: () => void; title?: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <AlertTriangle className="size-8 text-danger" aria-hidden />
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        حدث خطأ أثناء جلب البيانات. تحقق من اتصالك ثم أعد المحاولة. إن تكرر الخطأ فأبلغ المدير التقني.
      </p>
      <Button onClick={reset} variant="outline">
        <RotateCcw aria-hidden />
        إعادة المحاولة
      </Button>
    </Card>
  );
}
