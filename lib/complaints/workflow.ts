import type { ComplaintStatus } from '@/lib/generated/prisma/enums';
import type { PermissionKey } from '@/lib/rbac';

// مسار الشكوى — PRD §5.1. هذا الجدول هو المصدر الوحيد للانتقالات المسموحة:
// كل Server Action تسأل canTransition() قبل أي تغيير، وأي انتقال غير مذكور هنا مرفوض.

type Transition = { to: ComplaintStatus; permission: PermissionKey };

export const TRANSITIONS: Record<ComplaintStatus, Transition[]> = {
  SUBMITTED: [{ to: 'UNDER_REVIEW', permission: 'complaints:triage' }],
  UNDER_REVIEW: [
    { to: 'ASSIGNED', permission: 'complaints:triage' },
    { to: 'DISMISSED', permission: 'complaints:close' },
  ],
  ASSIGNED: [{ to: 'COMMITTEE_REVIEW', permission: 'complaints:update_status' }],
  COMMITTEE_REVIEW: [
    { to: 'REFERRED', permission: 'complaints:refer' },
    { to: 'IN_PROGRESS', permission: 'complaints:update_status' },
  ],
  REFERRED: [{ to: 'WAITING_RESPONSE', permission: 'complaints:update_status' }],
  // §5.1 خطوة 9: IN_PROGRESS ↔ WAITING_RESPONSE
  WAITING_RESPONSE: [{ to: 'IN_PROGRESS', permission: 'complaints:update_status' }],
  IN_PROGRESS: [
    { to: 'RESOLVED', permission: 'complaints:update_status' },
    { to: 'WAITING_RESPONSE', permission: 'complaints:update_status' },
  ],
  RESOLVED: [{ to: 'CLOSED', permission: 'complaints:close' }],
  CLOSED: [],
  DISMISSED: [],
};

/** الصلاحية التي يتطلبها الانتقال، أو null إن لم يكن مسموحًا في المسار. */
export function transitionPermission(from: ComplaintStatus, to: ComplaintStatus): PermissionKey | null {
  return TRANSITIONS[from].find((t) => t.to === to)?.permission ?? null;
}

export const canTransition = (from: ComplaintStatus, to: ComplaintStatus) => transitionPermission(from, to) !== null;

/** الانتقالات المتاحة من حالة بصلاحية بعينها — لبناء أزرار الإجراء. */
export function nextStatuses(from: ComplaintStatus, permission: PermissionKey): ComplaintStatus[] {
  return TRANSITIONS[from].filter((t) => t.permission === permission).map((t) => t.to);
}

export const isTerminal = (s: ComplaintStatus) => TRANSITIONS[s].length === 0;

/** مراحل العرض في WorkflowTimeline — المسار الرئيسي بترتيبه. */
export const STAGES: ComplaintStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'ASSIGNED',
  'COMMITTEE_REVIEW',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
];

export const STATUS_LABELS: Record<ComplaintStatus, string> = {
  SUBMITTED: 'مُستلمة',
  UNDER_REVIEW: 'قيد الفرز',
  ASSIGNED: 'محوّلة للجنة',
  COMMITTEE_REVIEW: 'تدرسها اللجنة',
  REFERRED: 'محوّلة لجهة خارجية',
  WAITING_RESPONSE: 'بانتظار رد',
  IN_PROGRESS: 'قيد المعالجة',
  RESOLVED: 'حُلّت',
  CLOSED: 'مغلقة',
  DISMISSED: 'مستبعدة',
};

/** الحالات التي لم تُحسم بعد — للعدّادات واللوحات. */
export const OPEN_STATUSES: ComplaintStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'ASSIGNED',
  'COMMITTEE_REVIEW',
  'REFERRED',
  'WAITING_RESPONSE',
  'IN_PROGRESS',
];
