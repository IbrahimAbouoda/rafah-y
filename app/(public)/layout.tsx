import Link from 'next/link';
import { ThemeToggle } from '@/components/shared/theme-toggle';

// الصفحات العامة — بلا تسجيل دخول (PRD §11.1). الروابط هنا لمسارات Sprint 1 المنفَّذة فقط.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-1.5rem)] flex-col">
      <header className="border-b bg-surface">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          <span className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-brand">نبض رفح</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">صوت الشباب... فكرة تتحول إلى أثر</span>
          </span>
          <nav aria-label="روابط عامة" className="ms-auto flex items-center gap-1 text-sm">
            <Link href="/track" className="rounded-lg px-2 py-1.5 hover:bg-muted">
              تتبّع شكوى
            </Link>
            <Link href="/complaints/public-new" className="rounded-lg px-2 py-1.5 hover:bg-muted">
              تقديم شكوى
            </Link>
            <Link href="/login" className="rounded-lg px-2 py-1.5 hover:bg-muted">
              دخول
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
