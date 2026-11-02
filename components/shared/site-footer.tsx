import Image from 'next/image';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { COUNCIL_EMAIL, COUNCIL_NAME_AR, COUNCIL_NAME_EN } from '@/lib/config';
import { COMPLAINT_CTA, PUBLIC_NAV } from '@/lib/public-nav';
import logo from '@/public/logo.png';

/** تذييل موحّد للصفحات العامة ولوحات الدخول — الشعار والاسم الرسمي (D40) وروابط من lib/public-nav.ts */
export function SiteFooter() {
  return (
    <footer className="mt-8 border-t bg-surface">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-2">
          <div className="flex items-center gap-3">
            <Image src={logo} alt="" width={56} height={56} className="size-14 shrink-0 rounded-lg bg-white" />
            <div className="leading-snug">
              <p className="font-semibold text-brand">{COUNCIL_NAME_AR}</p>
              <p className="text-sm text-muted-foreground" dir="ltr" lang="en">
                {COUNCIL_NAME_EN}
              </p>
            </div>
          </div>
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">
            نبض رفح: شكاوى الشباب وأفكارهم ومبادراتهم في مسار موثّق، ونتائجها منشورة للجميع.
          </p>
          <a href={`mailto:${COUNCIL_EMAIL}`} className="inline-flex items-center gap-2 self-start text-sm text-brand hover:underline">
            <Mail className="size-4" aria-hidden />
            <span dir="ltr">{COUNCIL_EMAIL}</span>
          </a>
        </div>
        {PUBLIC_NAV.map((g) => (
          <nav key={g.id} aria-labelledby={`footer-${g.id}`} className="flex flex-col gap-2">
            <h2 id={`footer-${g.id}`} className="text-sm font-semibold">
              {g.label}
            </h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              {(g.id === 'participate' ? [COMPLAINT_CTA, ...g.links] : g.links).map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-muted-foreground hover:text-brand hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-5xl px-4 py-4 text-center text-xs text-muted-foreground sm:text-start">
          © {new Date().getFullYear()} {COUNCIL_NAME_AR}. جميع الحقوق محفوظة.
        </p>
      </div>
    </footer>
  );
}
