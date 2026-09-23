import 'server-only';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { landingPath } from '@/lib/nav';
import { can, type PermissionKey, type SessionUser } from '@/lib/rbac';

/**
 * فحص الصفحة على الخادم قبل أي قراءة (PRD §6.2). غير المسجَّل يُحوَّل للدخول.
 * `allowed = false` ⇒ تعرض الصفحة <Forbidden> ولا تستعلم شيئًا.
 */
export async function guardPage(
  path: string,
  permission: PermissionKey,
): Promise<{ user: SessionUser; allowed: boolean; backHref: string }> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  return { user, allowed: can(user, permission), backHref: landingPath(user) ?? '/login' };
}
