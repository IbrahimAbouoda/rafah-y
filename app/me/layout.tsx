import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { isInternal, meNavFor } from '@/lib/nav';
import { serializeGrants } from '@/lib/rbac';
import { currentTermName, unreadCount } from '@/lib/shell';
import { AppShell } from '@/components/shared/app-shell';

// بوابة الشباب — PRD §11.1: تسجيل الدخول يكفي للدخول، وكل صفحة تفحص صلاحيتها على الخادم.
export const dynamic = 'force-dynamic';

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/me');

  const [currentTerm, unread] = await Promise.all([currentTermName(), unreadCount(user.id)]);

  return (
    <AppShell
      user={user}
      grants={serializeGrants(user.grants)}
      nav={meNavFor(user)}
      currentTerm={currentTerm}
      unreadCount={unread}
      switchTo={isInternal(user) ? { href: '/admin', label: 'لوحة المجلس' } : undefined}
    >
      {children}
    </AppShell>
  );
}
