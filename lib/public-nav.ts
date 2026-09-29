// روابط الصفحات العامة (PRD §11.1 · §11.2) — مصدر واحد للرأس والقائمة الجانبية على الجوال والتذييل.
// مسارات منفَّذة فقط؛ تقديم الشكوى زر مستقل في الرأس لا عنصر في قائمة.

export type PublicLink = { href: string; label: string };
export type PublicNavGroup = { id: string; label: string; links: PublicLink[] };

export const COMPLAINT_CTA: PublicLink = { href: '/complaints/public-new', label: 'قدّم شكوى' };

export const PUBLIC_NAV: PublicNavGroup[] = [
  {
    id: 'participate',
    label: 'المشاركة والخدمات',
    links: [
      { href: '/track', label: 'تتبّع شكوى' },
      { href: '/ideas', label: 'الأفكار' },
      { href: '/initiatives', label: 'المبادرات' },
      { href: '/opportunities', label: 'الفرص' },
      { href: '/activities', label: 'الأنشطة' },
      { href: '/help', label: 'مساعدة' },
    ],
  },
  {
    id: 'council',
    label: 'عن المجلس والشفافية',
    links: [
      { href: '/how-it-works', label: 'كيف تعمل المنصة' },
      { href: '/committees', label: 'اللجان' },
      { href: '/transparency', label: 'الشفافية' },
      { href: '/support', label: 'ادعمنا' },
    ],
  },
];
