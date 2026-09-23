// حالة تعيين الدور للعرض. المصدر الموثوق للصلاحيات هو activeAssignmentsWhere() في lib/session.ts —
// هذه الدالة تطابق شروطه نفسها (§3.2) على صف محمَّل مسبقًا.

export type AssignmentLike = {
  startsAt: Date;
  endsAt: Date | null;
  revokedAt: Date | null;
  role: { isTermBound: boolean };
  term: { isCurrent: boolean } | null;
};

export type AssignmentStatus = 'active' | 'expiring' | 'revoked' | 'inactive';

export function assignmentStatus(a: AssignmentLike, now = new Date()): AssignmentStatus {
  if (a.revokedAt) return 'revoked';
  if (a.startsAt > now) return 'inactive';
  if (a.endsAt && a.endsAt <= now) return 'inactive';
  if (a.role.isTermBound && !a.term?.isCurrent) return 'inactive';
  return a.endsAt ? 'expiring' : 'active';
}

export const isLive = (a: AssignmentLike, now = new Date()) => {
  const s = assignmentStatus(a, now);
  return s === 'active' || s === 'expiring';
};
