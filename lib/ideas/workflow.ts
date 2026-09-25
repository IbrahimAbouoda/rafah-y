import type { IdeaStatus } from '@/lib/generated/prisma/enums';
import type { PermissionKey } from '@/lib/rbac';

// مسار الفكرة — PRD §5.2 · AC-07 · AC-08. المصدر الوحيد للانتقالات المسموحة.
// «أرشفة» المقترح = رفض بسبب مكتوب (ideas:approve) أو دمج بفكرة مشابهة (ideas:merge) — D24.
// التصويت مؤشر أولوية لا بوابة: لا انتقال هنا يعتمد على عدد الأصوات.

type Transition = { to: IdeaStatus; permission: PermissionKey };

export const IDEA_TRANSITIONS: Record<IdeaStatus, Transition[]> = {
  SUBMITTED: [
    { to: 'SCREENING', permission: 'ideas:review' },
    { to: 'MERGED', permission: 'ideas:merge' },
  ],
  SCREENING: [
    { to: 'COMMITTEE_REVIEW', permission: 'ideas:review' },
    { to: 'MERGED', permission: 'ideas:merge' },
  ],
  COMMITTEE_REVIEW: [
    { to: 'CHANGES_REQUESTED', permission: 'ideas:review' },
    { to: 'APPROVED', permission: 'ideas:approve' },
    { to: 'REJECTED', permission: 'ideas:approve' },
    { to: 'MERGED', permission: 'ideas:merge' },
  ],
  // صاحب الفكرة يعدّلها فتعود للجنة (D ← C في §5.2)
  CHANGES_REQUESTED: [{ to: 'COMMITTEE_REVIEW', permission: 'ideas:create' }],
  APPROVED: [],
  REJECTED: [],
  MERGED: [],
};

export function ideaTransitionPermission(from: IdeaStatus, to: IdeaStatus): PermissionKey | null {
  return IDEA_TRANSITIONS[from].find((t) => t.to === to)?.permission ?? null;
}

export function nextIdeaStatuses(from: IdeaStatus, permission: PermissionKey): IdeaStatus[] {
  return IDEA_TRANSITIONS[from].filter((t) => t.permission === permission).map((t) => t.to);
}

/** تظهر للعامة في /ideas — المُستلمة تنتظر الفرز أولًا (افتراض Q17) */
export const PUBLIC_IDEA_STATUSES: IdeaStatus[] = ['SCREENING', 'COMMITTEE_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED'];

/** يُصوَّت عليها — لا تصويت على المدموجة ولا المحسومة (AC-08 ②) */
export const VOTABLE_IDEA_STATUSES: IdeaStatus[] = ['SCREENING', 'COMMITTEE_REVIEW', 'CHANGES_REQUESTED'];

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  SUBMITTED: 'مُستلمة',
  SCREENING: 'فرز أولي',
  COMMITTEE_REVIEW: 'مراجعة اللجنة',
  CHANGES_REQUESTED: 'مطلوب تعديل',
  APPROVED: 'معتمدة',
  REJECTED: 'مرفوضة',
  MERGED: 'مدموجة',
};
