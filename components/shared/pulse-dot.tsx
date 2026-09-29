import { cn } from '@/lib/utils';

/** نقطة نابضة لما لم يُقرأ بعد — زخرفية، والنص المرافق يحمل المعنى للقارئ الشاشي. الحجم من className (افتراضيًا size-2.5) */
export function PulseDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative flex size-2.5 shrink-0', className)} aria-hidden>
      <span className="absolute inline-flex size-full rounded-full bg-alert opacity-60 motion-safe:animate-ping" />
      <span className="relative inline-flex size-full rounded-full bg-alert" />
    </span>
  );
}
