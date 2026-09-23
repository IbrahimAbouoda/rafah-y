'use client';

import { startTransition, useActionState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { readContactAction } from '@/server/actions/complaints/contact';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/surface';

const CHANNELS: Record<string, string> = { PHONE: 'اتصال هاتفي', EMAIL: 'البريد', WHATSAPP: 'واتساب' };

// بيانات التواصل لا تُرسل مع الصفحة: تُطلب صراحة، ويُسجَّل الطلب في التدقيق (§6.6 · §12 DataTable)
export function ContactReveal({ complaintId }: { complaintId: string }) {
  const [state, action, pending] = useActionState(readContactAction, null);
  const view = state?.ok ? state.data : undefined;

  if (view) {
    const rows: [string, string | null | undefined][] = [
      ['الحساب', view.account ? `${view.account.fullName}${view.account.email ? ` · ${view.account.email}` : ''}` : null],
      ['الاسم', view.name],
      ['الجوّال', view.phone],
      ['البريد', view.email],
      ['وسيلة التواصل المفضلة', view.preferredChannel ? CHANNELS[view.preferredChannel] : null],
    ];
    const shown = rows.filter(([, v]) => v);
    return (
      <div className="flex flex-col gap-2 text-sm">
        {shown.length > 0 ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {shown.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd dir="auto">{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className="text-xs text-muted-foreground">{state?.message}</p>
      </div>
    );
  }

  return (
    <form
      action={action}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="complaintId" value={complaintId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="self-start">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Eye aria-hidden />}
        عرض بيانات التواصل
      </Button>
      <p className="text-xs text-muted-foreground">كل عرض يُسجَّل باسمك في سجل التدقيق.</p>
      {state?.ok === false ? <Alert tone="danger">{state.message}</Alert> : null}
    </form>
  );
}
