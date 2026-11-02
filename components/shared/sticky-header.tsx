import { cn } from '@/lib/utils';

/** رأس لاصق شبه شفاف بتضبيب خفيف — مشترك بين الصفحات العامة ولوحات الدخول */
export function StickyHeader({ className, ...props }: React.ComponentProps<'header'>) {
  return (
    <header
      className={cn('sticky top-0 z-20 border-b border-border/70 bg-surface/75 shadow-xs backdrop-blur-md', className)}
      {...props}
    />
  );
}
