import Image from 'next/image';
import { COUNCIL_NAME_AR, COUNCIL_NAME_EN } from '@/lib/config';
import logo from '@/public/logo.png';

/** تذييل موحّد للصفحات العامة ولوحات الدخول — الشعار والاسم الرسمي (D40) */
export function SiteFooter() {
  return (
    <footer className="border-t bg-surface">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 px-4 py-6 text-center sm:flex-row sm:text-start">
        <Image src={logo} alt="" width={56} height={56} className="size-14 shrink-0 rounded-lg bg-white" />
        <div className="leading-snug">
          <p className="font-semibold text-brand">{COUNCIL_NAME_AR}</p>
          <p className="text-sm text-muted-foreground" dir="ltr" lang="en">
            {COUNCIL_NAME_EN}
          </p>
        </div>
        <p className="text-xs text-muted-foreground sm:ms-auto">
          © {new Date().getFullYear()} {COUNCIL_NAME_AR} · نبض رفح
        </p>
      </div>
    </footer>
  );
}
