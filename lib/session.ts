import 'server-only';
import type { Db, Tx } from '@/lib/db';
import { buildGrants, type SessionUser } from '@/lib/rbac';

/**
 * التعيينات الفعّالة الآن — PRD §3.2:
 * غير مسحوب · بدأ · لم ينتهِ · ودورته حالية إن كان الدور مرتبطًا بدورة.
 */
export function activeAssignmentsWhere(userId: string, now = new Date()) {
  return {
    userId,
    revokedAt: null,
    startsAt: { lte: now },
    AND: [
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      { OR: [{ role: { isTermBound: false } }, { term: { isCurrent: true } }] },
    ],
  };
}

/** يحمّل المستخدم ومنحه من قاعدة البيانات في كل طلب — سحب الدور يسري في الطلب التالي (AC-16 ②). */
export async function loadSessionUser(db: Db | Tx, userId: string, now = new Date()): Promise<SessionUser | null> {
  const user = await db.user.findFirst({
    where: { id: userId, isActive: true },
    select: { id: true, authId: true, fullName: true, email: true, phone: true },
  });
  if (!user) return null;

  const assignments = await db.roleAssignment.findMany({
    where: activeAssignmentsWhere(userId, now),
    orderBy: { createdAt: 'asc' },
    select: {
      committeeId: true,
      endsAt: true,
      committee: { select: { slug: true, nameAr: true } },
      role: {
        select: {
          key: true,
          nameAr: true,
          permissions: { select: { scope: true, permission: { select: { key: true } } } },
        },
      },
    },
  });

  return {
    ...user,
    roles: assignments.map((a) => ({
      key: a.role.key,
      nameAr: a.role.nameAr,
      committeeId: a.committeeId,
      committeeSlug: a.committee?.slug ?? null,
      committeeNameAr: a.committee?.nameAr ?? null,
      endsAt: a.endsAt,
    })),
    grants: buildGrants(assignments),
  };
}
