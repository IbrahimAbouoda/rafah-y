import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Card, interactiveCard, Skeleton } from '@/components/ui/surface';
import { cn } from '@/lib/utils';

// StatTile — PRD §12. «لا بيانات بعد» بدل صفر مضلل · شرطة عند الخطأ لا رقم قديم.
// الرقم يُحسب على الخادم من بيانات يحق للمستخدم رؤيتها فقط (readableComplaints).

type Tone = 'default' | 'brand' | 'warning' | 'success';

/** لون الرقم · خلفية الأيقونة · تدرّج خفيف جدًا للبطاقة — لكل نبرة */
const tones: Record<Tone, { value: string; icon: string; wash: string }> = {
  default: { value: '', icon: 'bg-muted text-muted-foreground', wash: 'from-muted/60' },
  brand: { value: 'text-brand', icon: 'bg-brand/10 text-brand', wash: 'from-brand-soft/70' },
  warning: { value: 'text-warning', icon: 'bg-warning-soft text-warning', wash: 'from-warning-soft/70' },
  success: { value: 'text-success', icon: 'bg-success-soft text-success', wash: 'from-success-soft/70' },
};

export function StatTile({
  value,
  label,
  meta,
  tone = 'default',
  icon: Icon,
  href,
  emptyWhenZero = false,
  noData = false,
}: {
  /** null = تعذّر الحساب · نص = قيمة منسّقة مسبقًا (نسبة، ساعات) */
  value: number | string | null;
  label: string;
  meta?: string;
  tone?: Tone;
  /** أيقونة Lucide بخلفية ناعمة بلون النبرة */
  icon?: LucideIcon;
  href?: string;
  /** للعدّادات التي لا معنى لصفرها قبل وجود أي سجل */
  emptyWhenZero?: boolean;
  /** لا قيمة بعد لسبب مشروع (مقام صفري، مؤشر لم يُفعَّل) — تُعرض «لا بيانات بعد» */
  noData?: boolean;
}) {
  const shown = noData
    ? null
    : value === null
      ? '—'
      : typeof value === 'string'
        ? value
        : emptyWhenZero && value === 0
          ? null
          : value.toLocaleString('ar-PS-u-nu-latn');
  const t = tones[tone];
  const body = (
    <Card className={cn('flex h-full flex-col gap-1 bg-linear-to-br to-surface to-60% p-4', t.wash, href && interactiveCard)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', t.icon)}>
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>
      {shown === null ? (
        <p className="text-sm font-medium text-muted-foreground">لا بيانات بعد</p>
      ) : (
        <p className={cn('text-3xl font-bold tracking-tight', t.value)}>{shown}</p>
      )}
      {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-ring">
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
