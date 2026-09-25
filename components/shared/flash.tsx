'use client';

import { createContext, use, useCallback, useState } from 'react';
import { Alert } from '@/components/ui/surface';

// رسالة نجاح الإجراء على مستوى الهيكل (AppShell) — تبقى حين يختفي النموذج نفسه بعد تغيّر الحالة
// (قرار العرض، اعتماد القيد، فتح الفرز…). تُسجَّل من داخل استدعاء الإجراء، قبل أن يُزال النموذج.

type Flash = { message: string; at: number } | null;

const FlashContext = createContext<((message: string) => void) | null>(null);

export function FlashProvider({ children }: { children: React.ReactNode }) {
  const [flash, setFlash] = useState<Flash>(null);
  const push = useCallback((message: string) => setFlash({ message, at: Date.now() }), []);
  return (
    <FlashContext value={push}>
      {flash ? (
        <div className="mb-4">
          <Alert key={flash.at} tone="success">
            {flash.message}
          </Alert>
        </div>
      ) : null}
      {children}
    </FlashContext>
  );
}

/** null خارج AppShell (صفحات الدخول): النموذج يعرض نجاحه في مكانه */
export const useFlash = () => use(FlashContext);
