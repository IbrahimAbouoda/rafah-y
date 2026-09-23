import Link from 'next/link';
import { Card } from '@/components/ui/surface';
import { Skeleton } from '@/components/ui/surface';
import { cn } from '@/lib/utils';

// StatTile — PRD §12. «لا بيانات بعد» بدل صفر مضلل · شرطة عند الخطأ لا رقم قديم.
// الرقم يُحسب على الخادم من بيانات يحق للمستخدم رؤيتها فقط (readableComplaints).

type Tone = 'default' | 'brand' | 'warning' | 'success';

const tones: Record<Tone, string> = {
  default: '',
  brand: 'text-brand',
  warning: 'text-warning',
  success: 'text-success',
};

export function StatTile({
  value,
  label,
  meta,
  tone = 'default',
  href,
  emptyWhenZero = false,
}: {
  /** null = تعذّر الحساب */
  value: number | null;
  label: string;
  meta?: string;
  tone?: Tone;
  href?: string;
  /** للعدّادات التي لا معنى لصفرها قبل وجود أي سجل */
  emptyWhenZero?: boolean;
}) {
  const shown = value === null ? '—' : emptyWhenZero && value === 0 ? null : value.toLocaleString('ar-PS-u-nu-latn');
  const body = (
    <Card className={cn('flex h-full flex-col gap-1 p-4', href && 'transition-colors hover:bg-muted/50')}>
      <p className="text-sm text-muted-foreground">{label}</p>
      {shown === null ? (
        <p className="text-sm font-medium text-muted-foreground">لا بيانات بعد</p>
      ) : (
        <p className={cn('text-2xl font-semibold', tones[tone])}>{shown}</p>
      )}
      {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
      {body}
    </Link>
  ) : (
    body
  );
}

export function StatTileSkeleton() {
  return (
    <Card className="flex flex-col gap-2 p-4" aria-hidden>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-7 w-12" />
    </Card>
  );
}
