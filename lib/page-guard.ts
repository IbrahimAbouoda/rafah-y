import 'server-only';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { landingPath } from '@/lib/nav';
import { can, canBeyondOwn, type PermissionKey, type SessionUser } from '@/lib/rbac';

/**
 * فحص الصفحة على الخادم قبل أي قراءة (PRD §6.2). غير المسجَّل يُحوَّل للدخول.
 * `allowed = false` ⇒ تعرض الصفحة <Forbidden> ولا تستعلم شيئًا.
 *
 * permission مصفوفة ⇒ تكفي أيٌّ منها (مثل /admin/inbox — D4).
 * beyondOwn ⇒ الصفحة تعرض سجلات الآخرين، فلا يكفي نطاق «خاص» (مثل /admin/complaints للشاب).
 * permission = null ⇒ يكفي تسجيل الدخول.
 */
export async function guardPage(
  path: string,
  permission: PermissionKey | PermissionKey[] | null,
  opts: { beyondOwn?: boolean } = {},
): Promise<{ user: SessionUser; allowed: boolean; backHref: string }> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  const keys = permission === null ? [] : Array.isArray(permission) ? permission : [permission];
  const check = opts.beyondOwn ? canBeyondOwn : can;
  const allowed = keys.length === 0 || keys.some((k) => check(user, k));
  return { user, allowed, backHref: landingPath(user) };
}
