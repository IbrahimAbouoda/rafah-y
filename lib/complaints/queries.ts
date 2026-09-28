import 'server-only';
import type { Prisma } from '@/lib/generated/prisma/client';
import { scopeFilter, type PermissionKey, type SessionUser } from '@/lib/rbac';
import { COMPLAINT_STATUSES } from '@/lib/validation/complaints';
import { OPEN_STATUSES } from './workflow';

/** شرط الشكاوى التي يشملها نطاق المستخدم في صلاحية معيّنة. null ⇒ لا شيء. */
function complaintsInScope(user: SessionUser, key: PermissionKey): Prisma.ComplaintWhereInput | null {
  const scope = scopeFilter(user, key);
  if (!scope) return null;
  if (scope.all) return {};
  const or: Prisma.ComplaintWhereInput[] = [];
  if (scope.committees.length > 0) or.push({ committeeId: { in: scope.committees } });
  if (scope.own) or.push({ submitterId: user.id });
  return or.length > 0 ? { OR: or } : null;
}

/**
 * شرط الشكاوى التي يحق للمستخدم رؤيتها بـ complaints:read — يُضاف إلى كل استعلام قائمة أو عدّاد
 * (StatTile: «المؤشر لا يُحسب إلا من بيانات يحق للمستخدم رؤيتها»). null ⇒ لا شيء.
 */
export function readableComplaints(user: SessionUser): Prisma.ComplaintWhereInput | null {
  return complaintsInScope(user, 'complaints:read');
}

/** التصدير = تقاطع نطاق القراءة ونطاق complaints:export: لا يُصدَّر ما لا يُرى في الواجهة */
export function exportableComplaints(user: SessionUser): Prisma.ComplaintWhereInput | null {
  const read = readableComplaints(user);
  const exp = complaintsInScope(user, 'complaints:export');
  return read && exp ? { AND: [read, exp] } : null;
}

export type ComplaintListParams = { status?: string; committee?: string; q?: string };

/** مرشّحات قائمة /admin/complaints — نفسها في الصفحة وفي ملف التصدير */
export function complaintListFilters(params: ComplaintListParams): Prisma.ComplaintWhereInput[] {
  const filters: Prisma.ComplaintWhereInput[] = [];
  const status = params.status ?? '';
  if (status === 'open') filters.push({ status: { in: OPEN_STATUSES } });
  else if ((COMPLAINT_STATUSES as readonly string[]).includes(status)) {
    filters.push({ status: status as (typeof COMPLAINT_STATUSES)[number] });
  }
  if (params.committee && /^[0-9a-f-]{36}$/i.test(params.committee)) filters.push({ committeeId: params.committee });
  const q = params.q?.trim() ?? '';
  if (q) {
    filters.push({
      OR: [{ reference: { contains: q.toUpperCase() } }, { title: { contains: q, mode: 'insensitive' } }],
    });
  }
  return filters;
}
