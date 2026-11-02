import Link from 'next/link';
import { PublicNav, type PublicNavGroup } from '@/components/shared/public-nav';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { APP_NAME_AR, COUNCIL_NAME_AR } from '@/lib/config';

// الروابط هنا لمسارات منفَّذة فقط؛ /transparency وتقاريره تُضاف مع Sprint 5
const NAV_GROUPS: PublicNavGroup[] = [
  {
    label: 'الخدمات والأنشطة',
    items: [
      { href: '/initiatives', label: 'المبادرات' },
      { href: '/ideas', label: 'الأفكار' },
      { href: '/demand', label: 'مجالات التدريب' },
      { href: '/track', label: 'تتبّع شكوى' },
    ],
  },
  {
    label: 'المجلس والشفافية',
    items: [
      { href: '/committees', label: 'اللجان' },
      { href: '/transparency/finance', label: 'الشفافية المالية' },
      { href: '/support', label: 'ادعمنا' },
    ],
  },
];

// الصفحات العامة — بلا تسجيل دخول (PRD §11.1).
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-1.5rem)] flex-col">
      <header className="border-b bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-brand">{APP_NAME_AR}</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">{COUNCIL_NAME_AR}</span>
          </Link>
          <nav aria-label="روابط عامة" className="flex flex-wrap items-center gap-0.5 text-sm sm:ms-auto">
            <PublicNav groups={NAV_GROUPS} />
            <Link href="/login" className="rounded-lg px-2 py-1.5 hover:bg-muted">
              دخول
            </Link>
            <Link
              href="/complaints/public-new"
              className="rounded-lg bg-council-blue px-3 py-1.5 font-medium text-brand-foreground transition-colors hover:bg-council-blue/90"
            >
              قدم شكوى
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
