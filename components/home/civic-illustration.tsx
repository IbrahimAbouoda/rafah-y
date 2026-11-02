/** أوراق غصن الزيتون: [x, y, زاوية] */
const LEAVES = [
  [170, 360, -30],
  [215, 364, 20],
  [260, 360, -25],
  [305, 352, 25],
  [345, 338, -20],
] as const;

/**
 * رسم زخرفي للرئيسية: ثلاثة شباب بألوان الشعار حول جوّال يعرض مسار طلب موثّق، وغصن زيتون.
 * SVG مضمَّن بألوان الـ tokens (يتبع الوضع الداكن) — بلا طلب صورة إضافي، ومخفي عن القارئ الشاشي.
 */
export function CivicIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 400" className={className} aria-hidden focusable="false">
      <circle cx="240" cy="205" r="175" className="fill-brand-soft" />

      {/* الجوّال ومسار الطلب */}
      <rect x="170" y="70" width="140" height="250" rx="22" className="fill-surface stroke-border" strokeWidth="3" />
      <rect x="215" y="82" width="50" height="7" rx="3.5" className="fill-muted" />
      <rect x="186" y="104" width="108" height="30" rx="8" className="fill-brand" />
      <rect x="198" y="115" width="60" height="8" rx="4" className="fill-brand-foreground" opacity="0.9" />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(0 ${i * 46})`}>
          <rect x="186" y="148" width="108" height="36" rx="8" className="fill-surface stroke-border" strokeWidth="2" />
          <circle cx="276" cy="166" r="9" className={i < 2 ? 'fill-accent' : 'fill-muted'} />
          {i < 2 ? (
            <path d="M271.5 166l3 3 6-6" fill="none" className="stroke-accent-foreground" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          ) : null}
          <rect x="198" y="160" width={i === 2 ? 44 : 60} height="6" rx="3" className="fill-muted-foreground" opacity="0.45" />
          <rect x="198" y="171" width="36" height="5" rx="2.5" className="fill-muted-foreground" opacity="0.25" />
        </g>
      ))}
      <rect x="186" y="292" width="108" height="10" rx="5" className="fill-muted" />
      <rect x="186" y="292" width="72" height="10" rx="5" className="fill-accent" />

      {/* ثلاثة شباب بألوان الشعار */}
      <g className="fill-brand">
        <circle cx="240" cy="30" r="16" />
        <path d="M200 30c14 26 26 34 40 34s26-8 40-34c-10 30-22 46-40 46s-30-16-40-46z" />
      </g>
      <g className="fill-accent">
        <circle cx="96" cy="150" r="15" />
        <path d="M58 140c8 30 22 46 38 50 14 4 30 0 44-12-10 26-26 40-44 40-22 0-36-26-38-78z" />
      </g>
      <g className="fill-alert">
        <circle cx="384" cy="150" r="15" />
        <path d="M422 140c-8 30-22 46-38 50-14 4-30 0-44-12 10 26 26 40 44 40 22 0 36-26 38-78z" />
      </g>

      {/* فقاعات: فكرة وشكوى */}
      <g>
        <rect x="68" y="236" width="80" height="48" rx="14" className="fill-surface stroke-border" strokeWidth="2" />
        <path d="M128 284l10 14 2-14z" className="fill-surface stroke-border" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="108" cy="254" r="9" className="fill-accent" opacity="0.9" />
        <rect x="104" y="264" width="8" height="6" rx="2" className="fill-accent" />
      </g>
      <g>
        <rect x="332" y="236" width="80" height="48" rx="14" className="fill-surface stroke-border" strokeWidth="2" />
        <path d="M352 284l-10 14-2-14z" className="fill-surface stroke-border" strokeWidth="2" strokeLinejoin="round" />
        <path d="M358 252l20-8v24l-20-8z" className="fill-alert" />
        <rect x="350" y="252" width="9" height="8" rx="2" className="fill-alert" />
        <path d="M384 250c4 3 4 9 0 12" fill="none" className="stroke-alert" strokeWidth="2.5" strokeLinecap="round" />
      </g>

      {/* غصن زيتون */}
      <path d="M120 360c60 12 180 14 250-22" fill="none" className="stroke-accent" strokeWidth="4" strokeLinecap="round" />
      {LEAVES.map(([x, y, r]) => (
        <ellipse key={x} cx={x} cy={y - 10} rx="7" ry="15" transform={`rotate(${r} ${x} ${y})`} className="fill-accent" opacity="0.85" />
      ))}
    </svg>
  );
}
