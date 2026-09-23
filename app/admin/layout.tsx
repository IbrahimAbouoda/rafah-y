import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { navFor } from '@/lib/nav';
import { serializeGrants } from '@/lib/rbac';
import { AppShell } from '@/components/shared/app-shell';

// كل ما تحت /admin يُعرض ديناميكيًا لكل طلب: الصلاحيات تُقرأ من قاعدة البيانات في كل مرة.
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/admin/settings/users');

  const nav = navFor(user);
  // لا عنصر مسموح ⇒ ليس دورًا داخليًا: يعود لصفحة الدخول التي تشرح حالته
  if (nav.length === 0) redirect('/login');

  const currentTerm = await db.councilTerm.findFirst({ where: { isCurrent: true }, select: { name: true } });

  return (
    <AppShell user={user} grants={serializeGrants(user.grants)} nav={nav} currentTerm={currentTerm}>
      {children}
    </AppShell>
  );
}
