import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { meNavFor, navFor } from '@/lib/nav';
import { serializeGrants } from '@/lib/rbac';
import { currentTermName, unreadCount } from '@/lib/shell';
import { AppShell } from '@/components/shared/app-shell';

// كل ما تحت /admin يُعرض ديناميكيًا لكل طلب: الصلاحيات تُقرأ من قاعدة البيانات في كل مرة.
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/admin');

  const nav = navFor(user);
  // لا عنصر مسموح ⇒ ليس دورًا داخليًا: بوابته هي /me
  if (nav.length === 0) redirect('/me');

  const [currentTerm, unread] = await Promise.all([currentTermName(), unreadCount(user.id)]);

  return (
    <AppShell
      user={user}
      grants={serializeGrants(user.grants)}
      nav={nav}
      currentTerm={currentTerm}
      unreadCount={unread}
      switchTo={meNavFor(user).length > 0 ? { href: '/me', label: 'بوابة الشباب' } : undefined}
    >
      {children}
    </AppShell>
  );
}
