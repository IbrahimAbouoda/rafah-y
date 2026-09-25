'use client';

import { startTransition, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import type { ActionState } from '@/lib/action';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Alert } from '@/components/ui/surface';
import { useFlash } from './flash';

// أزرار إجراء بنقرة واحدة (Server Actions حقيقية — C9). النجاح يُعرض في رسالة الهيكل (flash)
// لأن الإجراء الناجح يغيّر الحالة فتتغيّر الأزرار نفسها؛ الخطأ يبقى هنا بجانبها.

export type ActionButton = {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: string;
  variant?: ButtonProps['variant'];
};

export function ActionButtons({ items, empty }: { items: ActionButton[]; empty?: string }) {
  const [result, setResult] = useState<ActionState>(null);
  const [pending, begin] = useTransition();
  const [active, setActive] = useState<number | null>(null);
  const flash = useFlash();

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null}
      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <Button
            key={`${item.label}-${i}`}
            type="button"
            variant={item.variant ?? 'outline'}
            size="sm"
            disabled={pending}
            onClick={() => {
              const data = new FormData();
              for (const [k, v] of Object.entries(item.fields)) data.set(k, v);
              setActive(i);
              begin(async () => {
                const res = await item.action(null, data);
                if (res?.ok && res.message && flash) flash(res.message);
                startTransition(() => setResult(res));
              });
            }}
          >
            {pending && active === i ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {item.label}
          </Button>
        ))}
      </div>
      {result?.message && !(result.ok && flash) ? (
        <Alert key={result.at} tone={result.ok ? 'success' : 'danger'}>
          {result.message}
        </Alert>
      ) : null}
    </div>
  );
}
