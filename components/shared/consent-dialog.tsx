'use client';

import { useEffect, useRef } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ConsentDialog — PRD §12. يعرض بالضبط ما سيُشارك ومع من ولماذا. الرفض هو الافتراضي (عليه التركيز)،
// ولا يُغلق دون قرار صريح: لا زر إغلاق، و Esc لا يغلقه. الحفظ يتم بعد القرار في الخادم،
// وفشله يعني أن الموافقة لم تُمنح (لا يُكتب shareProfile ولا shareWithPartners).
export function ConsentDialog({
  open,
  purpose,
  dataPoints,
  recipient,
  onAccept,
  onDecline,
  acceptLabel = 'أوافق على المشاركة',
  declineLabel = 'لا أوافق',
}: {
  open: boolean;
  purpose: string;
  dataPoints: readonly string[];
  recipient: string;
  onAccept: () => void;
  onDecline: () => void;
  acceptLabel?: string;
  declineLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const declineRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      declineRef.current?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="consent-title"
      aria-describedby="consent-purpose"
      onCancel={(e) => e.preventDefault()}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border bg-surface p-0 text-foreground backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-brand" aria-hidden />
          <h2 id="consent-title" className="text-base font-semibold">
            موافقتك على مشاركة بياناتك
          </h2>
        </div>
        <p id="consent-purpose" className="text-sm">
          {purpose}
        </p>
        <div className="flex flex-col gap-1.5 text-sm">
          <p>
            <span className="text-muted-foreground">مع من: </span>
            <span className="font-medium">{recipient}</span>
          </p>
          <p className="text-muted-foreground">ما الذي يُشارك بالضبط:</p>
          <ul className="list-disc ps-5">
            {dataPoints.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">
          إن لم توافق يستمر الإجراء دون مشاركة أي بيانات. كل قراءة لبياناتك من الجهة تُسجَّل باسم قارئها.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button ref={declineRef} type="button" variant="outline" onClick={onDecline}>
            {declineLabel}
          </Button>
          <Button type="button" onClick={onAccept}>
            {acceptLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
