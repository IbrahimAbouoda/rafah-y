import 'server-only';
import type { Prisma } from '@/lib/generated/prisma/client';
import { scopeFilter, type SessionUser } from '@/lib/rbac';

/**
 * شرط الشكاوى التي يحق للمستخدم رؤيتها بـ complaints:read — يُضاف إلى كل استعلام قائمة أو عدّاد
 * (StatTile: «المؤشر لا يُحسب إلا من بيانات يحق للمستخدم رؤيتها»). null ⇒ لا شيء.
 */
export function readableComplaints(user: SessionUser): Prisma.ComplaintWhereInput | null {
  const scope = scopeFilter(user, 'complaints:read');
  if (!scope) return null;
  if (scope.all) return {};
  const or: Prisma.ComplaintWhereInput[] = [];
  if (scope.committees.length > 0) or.push({ committeeId: { in: scope.committees } });
  if (scope.own) or.push({ submitterId: user.id });
  return or.length > 0 ? { OR: or } : null;
}
