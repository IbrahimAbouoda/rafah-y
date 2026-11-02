'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** التصدير من طباعة المتصفح: «حفظ بصيغة PDF» — يعمل على الحاسوب والجوّال بلا مكوّن خادمي إضافي */
export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer aria-hidden />
      تصدير PDF
    </Button>
  );
}
