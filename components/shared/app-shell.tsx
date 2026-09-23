import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { logoutAction } from '@/server/actions/auth';
import type { NavGroup } from '@/lib/nav';
import type { SerializedGrants, SessionUser } from '@/lib/rbac';
import { Button } from '@/components/ui/button';
import { PermissionsProvider } from './permission-gate';
import { Sidebar } from './sidebar';
import { ThemeToggle } from './theme-toggle';

type Term = { name: string } | null;

function roleLabel(user: SessionUser): string {
  const internal = user.roles.find((r) => r.committeeNameAr) ?? user.roles[0];
  if (!internal) return 'بلا دور';
  return internal.committeeNameAr ? `${internal.nameAr} — ${internal.committeeNameAr}` : internal.nameAr;
}

/** الهيكل العام — PRD §12 AppShell · Header · Sidebar */
export function AppShell({
  user,
  grants,
  nav,
  currentTerm,
  children,
}: {
  user: SessionUser;
  grants: SerializedGrants;
  nav: NavGroup[];
  currentTerm: Term;
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
