'use client';

import { startTransition, useActionState, useEffect } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { getDownloadUrlAction } from '@/server/actions/files';
import { Button } from '@/components/ui/button';

// رابط موقّع قصير العمر يُطلب عند الضغط فقط، بعد فحص الصلاحية على الخادم وسطر file.download (§6.5)
export function FileDownload({ fileId, label }: { fileId: string; label: string }) {
  const [state, action, pending] = useActionState(getDownloadUrlAction, null);

  useEffect(() => {
    if (state?.ok && state.data?.url) window.location.assign(state.data.url);
  }, [state]);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="flex flex-col items-end gap-1"
    >
      <input type="hidden" name="fileId" value={fileId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending} aria-label={`تنزيل ${label}`}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
        تنزيل
      </Button>
      {state?.ok === false ? <p className="text-xs text-danger">{state.message}</p> : null}
    </form>
  );
}
