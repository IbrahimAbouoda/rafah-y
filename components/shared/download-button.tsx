'use client';

import { useState, useTransition } from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { DataState } from '@/lib/action';
import type { DownloadFile } from '@/lib/export/file';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Alert } from '@/components/ui/surface';

// زر تنزيل ملف يولّده Server Action على الخادم (المحور ٣). لا ملف دائم: النتيجة base64 تُحوَّل Blob في المتصفح.
// الإخفاء بصلاحية التصدير في الصفحة إخفاء بصري فقط — الإجراء نفسه يفحص الصلاحية والنطاق ويكتب سطر التدقيق.

type Action = (state: unknown, form: FormData) => Promise<DataState<DownloadFile>>;

function save(file: DownloadFile) {
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function DownloadButton({
  action,
  fields,
  label,
  variant = 'outline',
}: {
  action: Action;
  fields: Record<string, string | undefined>;
  label: string;
  variant?: ButtonProps['variant'];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant={variant}
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const data = new FormData();
            for (const [k, v] of Object.entries(fields)) if (v) data.set(k, v);
            const res = await action(null, data);
            if (res?.ok && res.data) save(res.data);
            else setError(res?.message ?? 'تعذّر تجهيز الملف. أعد المحاولة بعد قليل.');
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
        {label}
      </Button>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
