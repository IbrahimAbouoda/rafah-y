'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Megaphone, Menu, X } from 'lucide-react';
import { COMPLAINT_CTA, PUBLIC_NAV, type PublicLink } from '@/lib/public-nav';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './theme-toggle';

// تنقّل الصفحات العامة: قائمتان منسدلتان على الشاشات الواسعة، وقائمة جانبية (<dialog>) على الجوال.
// نمط «disclosure» لروابط الموقع (لا role=menu): Escape يغلق ويعيد التركيز، والنقر أو التركيز خارجها يغلقها.

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export function PublicNav({ account }: { account: PublicLink }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const groupsRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!groupsRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(null);
      document.getElementById(`nav-${open}-btn`)?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const closeDrawer = () => drawerRef.current?.close();
  const ctaActive = isActive(pathname, COMPLAINT_CTA.href);

  return (
    <div className="ms-auto flex items-center gap-1">
      {/* شاشات واسعة */}
      <nav ref={groupsRef} aria-label="روابط عامة" className="hidden items-center gap-0.5 lg:flex">
        {PUBLIC_NAV.map((g) => {
          const expanded = open === g.id;
          const current = g.links.some((l) => isActive(pathname, l.href));
          return (
            <div
              key={g.id}
              className="relative"
              onBlur={(e) => {
                if (expanded && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(null);
              }}
            >
              <button
                id={`nav-${g.id}-btn`}
                type="button"
                aria-expanded={expanded}
                aria-controls={`nav-${g.id}`}
                onClick={() => setOpen(expanded ? null : g.id)}
                className={cn(
                  'inline-flex h-10 items-center gap-1 rounded-lg px-3 text-sm font-medium hover:bg-muted',
                  current && 'text-brand',
                )}
              >
                {g.label}
                <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} aria-hidden />
              </button>
              <ul
                id={`nav-${g.id}`}
                hidden={!expanded}
                className="absolute start-0 top-full z-30 mt-1 w-56 rounded-xl border bg-surface p-1 shadow-lg"
              >
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      aria-current={isActive(pathname, l.href) ? 'page' : undefined}
                      onClick={() => setOpen(null)}
                      className="block rounded-lg px-3 py-2 text-sm hover:bg-muted aria-[current=page]:bg-brand-soft aria-[current=page]:font-semibold aria-[current=page]:text-brand"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <Link
          href={account.href}
          aria-current={isActive(pathname, account.href) ? 'page' : undefined}
          className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium hover:bg-muted aria-[current=page]:text-brand"
        >
          {account.label}
        </Link>
      </nav>

      <Button asChild size="sm" className="h-9 px-3 lg:h-10 lg:px-4">
        <Link href={COMPLAINT_CTA.href} aria-current={ctaActive ? 'page' : undefined}>
          <Megaphone className="hidden min-[400px]:block" aria-hidden />
          {COMPLAINT_CTA.label}
        </Link>
      </Button>

      <div className="hidden lg:block">
        <ThemeToggle />
      </div>

      {/* الجوال */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="القائمة"
        aria-haspopup="dialog"
        onClick={() => drawerRef.current?.showModal()}
      >
        <Menu aria-hidden />
      </Button>
      <dialog
        ref={drawerRef}
        aria-label="قائمة الصفحات"
        className="m-0 me-auto h-dvh max-h-none w-80 max-w-[85vw] bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeDrawer();
        }}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-14 items-center justify-between border-b px-4">
            <span className="font-semibold text-brand">نبض رفح</span>
            <Button variant="ghost" size="icon" aria-label="إغلاق القائمة" onClick={closeDrawer}>
              <X aria-hidden />
            </Button>
          </div>
          <nav aria-label="روابط عامة" className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
            {PUBLIC_NAV.map((g) => (
              <section key={g.id} aria-labelledby={`drawer-${g.id}`} className="flex flex-col gap-1">
                <h2 id={`drawer-${g.id}`} className="px-3 text-xs font-semibold text-muted-foreground">
                  {g.label}
                </h2>
                <ul className="flex flex-col">
                  {g.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        onClick={closeDrawer}
                        aria-current={isActive(pathname, l.href) ? 'page' : undefined}
                        className="block rounded-lg px-3 py-2.5 hover:bg-muted aria-[current=page]:bg-brand-soft aria-[current=page]:font-semibold aria-[current=page]:text-brand"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
          <div className="flex items-center gap-2 border-t p-4">
            <Button asChild variant="outline" className="flex-1">
              <Link href={account.href} onClick={closeDrawer}>
                {account.label}
              </Link>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </dialog>
    </div>
  );
}
