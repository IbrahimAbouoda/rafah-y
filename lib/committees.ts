import 'server-only';
import type { Db, Tx } from '@/lib/db';
import { scopeFilter, type SessionUser } from '@/lib/rbac';

// عضوية اللجنة = تعيين دور فعّال مقيّد بها في الدورة الحالية (§3.2 — لا جدول CommitteeMember).

function activeInCommittee(committeeId: string, now = new Date()) {
  return {
    committeeId,
    revokedAt: null,
    startsAt: { lte: now },
    user: { isActive: true, deletedAt: null },
    AND: [
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      { OR: [{ role: { isTermBound: false } }, { term: { isCurrent: true } }] },
    ],
  };
}

/** أعضاء اللجنة الآن مع أدوارهم فيها — للإسناد والعرض الداخلي */
export async function committeeMembers(client: Db | Tx, committeeId: string) {
  const rows = await client.roleAssignment.findMany({
    where: activeInCommittee(committeeId),
    orderBy: { createdAt: 'asc' },
    select: { user: { select: { id: true, fullName: true } }, role: { select: { nameAr: true } } },
  });
  const byUser = new Map<string, { id: string; fullName: string; roles: string[] }>();
  for (const r of rows) {
    const m = byUser.get(r.user.id) ?? { ...r.user, roles: [] };
    m.roles.push(r.role.nameAr);
    byUser.set(r.user.id, m);
  }
  return [...byUser.values()];
}

/** AC-05: المسند إليه يجب أن يكون عضوًا فعليًا في اللجنة في الدورة الحالية */
export async function isCommitteeMember(client: Db | Tx, committeeId: string, userId: string): Promise<boolean> {
  return (await client.roleAssignment.count({ where: { ...activeInCommittee(committeeId), userId } })) > 0;
}

/** اللجان التي يقرأها المستخدم بـ committees:read — لجانه، أو الكل لمن نطاقه «الكل» */
export function readableCommitteesWhere(user: SessionUser): { id?: { in: string[] } } | null {
  const scope = scopeFilter(user, 'committees:read');
  if (!scope) return null;
  if (scope.all) return {};
  return scope.committees.length > 0 ? { id: { in: scope.committees } } : null;
}

/** لجان المستخدم في الدورة الحالية — لمبدّل اللجنة (§12 CommitteeSwitcher: لجانه فقط، لا التسع) */
export function myCommittees(user: SessionUser): { id: string; slug: string; nameAr: string }[] {
  const seen = new Map<string, { id: string; slug: string; nameAr: string }>();
  for (const r of user.roles) {
    if (r.committeeId && r.committeeSlug && r.committeeNameAr && !seen.has(r.committeeId)) {
      seen.set(r.committeeId, { id: r.committeeId, slug: r.committeeSlug, nameAr: r.committeeNameAr });
    }
  }
  return [...seen.values()];
}
