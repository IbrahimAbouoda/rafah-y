import Link from 'next/link';
import { ArrowLeftRight, Bell, LogOut } from 'lucide-react';
import { logoutAction } from '@/server/actions/auth';
import type { NavGroup } from '@/lib/nav';
import type { SerializedGrants, SessionUser } from '@/lib/rbac';
import { Button } from '@/components/ui/button';
import { PermissionsProvider } from './permission-gate';
import { Sidebar } from './sidebar';
import { ThemeToggle } from './theme-toggle';

type Term = { name: string } | null;

/** كل دور مرة واحدة، مع اسم لجنته أو عدد لجانه: «شاب · رئيس المجلس · رئيس اللجنة (9 لجان)» */
function roleLabel(user: SessionUser): string {
  if (user.roles.length === 0) return 'بلا دور';
  const byRole = new Map<string, string[]>();
  for (const r of user.roles) {
    const list = byRole.get(r.nameAr) ?? [];
    if (r.committeeNameAr) list.push(r.committeeNameAr);
    byRole.set(r.nameAr, list);
  }
  return [...byRole]
    .map(([name, committees]) =>
      committees.length === 0 ? name : committees.length === 1 ? `${name} — ${committees[0]}` : `${name} (${committees.length} لجان)`,
    )
    .join(' · ');
}

/** الهيكل العام — PRD §12 AppShell · Header · Sidebar */
export function AppShell({
  user,
  grants,
  nav,
  currentTerm,
  unreadCount,
  switchTo,
  children,
}: {
  user: SessionUser;
  grants: SerializedGrants;
  nav: NavGroup[];
  currentTerm: Term;
  /** null = تعذّر العدّ: تُخفى الشارة ولا ينكسر الرأس (§12 Header) */
  unreadCount: number | null;
  /** التبديل بين بوابة الشباب ولوحة المجلس لمن يملك الاثنتين */
  switchTo?: { href: string; label: string };
  children: React.ReactNode;
}) {
  const home = nav[0]?.items[0]?.href ?? '/login';
  return (
    <PermissionsProvider userId={user.id} grants={grants}>
      <header className="sticky top-0 z-20 border-b bg-surface/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href={home} className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-brand">نبض رفح</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">منصة الشباب</span>
          </Link>
          <div className="ms-auto flex items-center gap-1">
            <div className="hidden text-end leading-tight sm:block">
              <p className="text-sm font-medium">{user.fullName}</p>
              <p className="text-xs text-muted-foreground">
                {roleLabel(user)}
                {currentTerm ? ` · ${currentTerm.name}` : ''}
              </p>
            </div>
            {switchTo ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={switchTo.href} aria-label={switchTo.label}>
                  <ArrowLeftRight aria-hidden />
                  <span className="hidden sm:inline">{switchTo.label}</span>
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="ghost" size="icon" className="relative">
              <Link
                href="/me/notifications"
                aria-label={unreadCount ? `الإشعارات: ${unreadCount} غير مقروءة` : 'الإشعارات'}
              >
                <Bell aria-hidden />
                {unreadCount ? (
                  <span className="absolute -end-0.5 -top-0.5 min-w-5 rounded-full bg-alert px-1 text-center text-[11px] leading-5 font-semibold text-alert-foreground">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </Link>
            </Button>
            <ThemeToggle />
            <form action={logoutAction}>
              <Button variant="ghost" size="icon" type="submit" aria-label="تسجيل الخروج">
                <LogOut className="flip-rtl" aria-hidden />
              </Button>
            </form>
          </div>
        </div>
      </header>
      <div className="flex flex-col lg:flex-row">
        <Sidebar groups={nav} />
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </PermissionsProvider>
  );
}
