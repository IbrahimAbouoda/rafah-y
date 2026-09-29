import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { landingPath } from '@/lib/nav';
import { BrandMark } from '@/components/shared/brand-mark';
import { FlashProvider } from '@/components/shared/flash';
import { PublicNav } from '@/components/shared/public-nav';
import { SiteFooter } from '@/components/shared/site-footer';
import { StickyHeader } from '@/components/shared/sticky-header';

// الصفحات العامة — بلا تسجيل دخول (PRD §11.1). الروابط من lib/public-nav.ts (مسارات منفَّذة فقط).
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // تعذّر قراءة الجلسة لا يكسر الصفحات العامة: يظهر «دخول» فقط
  const user = await getCurrentUser().catch(() => null);
  const account = user ? { href: landingPath(user), label: 'لوحتي' } : { href: '/login', label: 'دخول' };
  return (
    <div className="flex min-h-[calc(100dvh-1.5rem)] flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2"
      >
        تخطَّ إلى المحتوى
      </a>
      <StickyHeader>
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-2 px-4">
          <Link href="/" className="min-w-0 shrink">
            <BrandMark />
          </Link>
          <PublicNav account={account} />
        </div>
      </StickyHeader>
      {/* نتيجة الإجراء تبقى ظاهرة حين يتغيّر النموذج نفسه بعد النجاح (التقديم على فرصة، التسجيل في نشاط) */}
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
        <FlashProvider>{children}</FlashProvider>
      </main>
      <SiteFooter />
    </div>
  );
}
