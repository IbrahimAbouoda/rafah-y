import { cn } from '@/lib/utils';

/** رسم الحالة الفارغة: صندوق وارد فارغ بورقة وبريق خفيف — SVG مضمَّن بألوان الـ tokens، زخرفي فقط */
export function EmptyIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={cn('h-24 w-32', className)} aria-hidden focusable="false">
      <ellipse cx="80" cy="104" rx="52" ry="8" className="fill-muted" />
      <circle cx="80" cy="56" r="44" className="fill-brand-soft" />
      <rect x="58" y="22" width="44" height="52" rx="6" className="fill-surface stroke-border" strokeWidth="2" />
      <rect x="66" y="32" width="28" height="4" rx="2" className="fill-brand" opacity="0.7" />
      <rect x="66" y="42" width="22" height="4" rx="2" className="fill-muted-foreground" opacity="0.3" />
      <rect x="66" y="50" width="26" height="4" rx="2" className="fill-muted-foreground" opacity="0.3" />
      <path
        d="M40 66h24l6 10h20l6-10h24v22a6 6 0 0 1-6 6H46a6 6 0 0 1-6-6z"
        className="fill-surface stroke-brand"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M124 26l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" className="fill-accent" />
      <circle cx="34" cy="38" r="4" className="fill-alert" opacity="0.7" />
      <circle cx="130" cy="64" r="2.5" className="fill-brand" opacity="0.5" />
    </svg>
  );
}
