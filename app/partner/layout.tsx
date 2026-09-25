import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { landingPath, partnerNavFor } from '@/lib/nav';
import { serializeGrants } from '@/lib/rbac';
import { currentTermName, unreadCount } from '@/lib/shell';
import { AppShell } from '@/components/shared/app-shell';

// بوابة المؤسسات — PRD §11.1 · D26. كل صفحة تفحص صلاحيتها ونطاق مؤسسة المستخدم على الخادم.
export const dynamic = 'force-dynamic';

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/partner');
  const nav = partnerNavFor(user);
  if (nav.length === 0) redirect(landingPath(user));
  const [currentTerm, unread] = await Promise.all([currentTermName(), unreadCount(user.id)]);
  return (
    <AppShell
      user={user}
      grants={serializeGrants(user.grants)}
      nav={nav}
      currentTerm={currentTerm}
      unreadCount={unread}
      switchTo={{ href: '/me', label: 'بوابة الشباب' }}
    >
      {children}
    </AppShell>
  );
}
