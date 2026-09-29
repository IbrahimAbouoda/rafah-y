import type { ActivityKind, ActivityStatus, RegistrationStatus } from '@/lib/generated/prisma/enums';

// مسار النشاط — PRD §5.5 · AC-13. المصدر الوحيد للانتقالات المسموحة.
// الانتقالات كلها بـ activities:update بنطاق لجنة النشاط (D34: كل نشاط تتبعه لجنة).

export const ACTIVITY_TRANSITIONS: Record<ActivityStatus, ActivityStatus[]> = {
  DRAFT: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canMoveActivity(from: ActivityStatus, to: ActivityStatus): boolean {
  return ACTIVITY_TRANSITIONS[from].includes(to);
}

/** منتهٍ أو ملغى: لا يُعدَّل فيه إلا المخرجات والتوثيق (§5.5) */
export const FINISHED_ACTIVITY_STATUSES: ActivityStatus[] = ['COMPLETED', 'CANCELLED'];
export const EDITABLE_ACTIVITY_STATUSES: ActivityStatus[] = ['DRAFT', 'PUBLISHED'];

/** تظهر للعامة في /activities */
export const PUBLIC_ACTIVITY_STATUSES: ActivityStatus[] = ['PUBLISHED', 'COMPLETED'];

/** يشغل مقعدًا: المسجّل والحاضر. قائمة الانتظار والغائب والملغى لا */
/** الأنشطة القادمة المعروضة للعامة — /activities و«آخر المستجدات» في الرئيسية */
export const upcomingActivityWhere = (now = new Date()) => ({ status: 'PUBLISHED' as const, startsAt: { gte: now } });

export const SEAT_HOLDING: RegistrationStatus[] = ['REGISTERED', 'ATTENDED'];

/**
 * هل يقبل النشاط تسجيلًا الآن؟ null = يقبل · نص = سبب الرفض بالعربية.
 * التسجيل يُغلق عند بدء النشاط.
 */
export function registerBlocker(
  a: { status: ActivityStatus; registrationOpen: boolean; startsAt: Date },
  now = new Date(),
): string | null {
  if (a.status !== 'PUBLISHED') return 'هذا النشاط غير منشور أو انتهى، فلا يقبل تسجيلًا.';
  if (!a.registrationOpen) return 'التسجيل في هذا النشاط مغلق حاليًا.';
  if (a.startsAt.getTime() <= now.getTime()) return 'بدأ النشاط، فأُغلق التسجيل فيه.';
  return null;
}

/** §5.5: التسجيل بعد امتلاء المقاعد يصبح WAITLISTED لا REGISTERED. seats = null ⇒ بلا حد */
export function registrationStatusFor(taken: number, seats: number | null): RegistrationStatus {
  return seats !== null && taken >= seats ? 'WAITLISTED' : 'REGISTERED';
}

/** AC-13 Security: التقييم من الحاضر فقط */
export const canRate = (status: RegistrationStatus) => status === 'ATTENDED';

/** الحضور يُسجَّل بعد بدء النشاط، ولمن لم يلغِ تسجيله */
export const ATTENDANCE_MARKS: RegistrationStatus[] = ['ATTENDED', 'NO_SHOW'];
export const MARKABLE: RegistrationStatus[] = ['REGISTERED', 'WAITLISTED', 'ATTENDED', 'NO_SHOW'];

export function attendanceBlocker(a: { status: ActivityStatus; startsAt: Date }, now = new Date()): string | null {
  if (a.status !== 'PUBLISHED' && a.status !== 'COMPLETED') return 'لا يُسجَّل الحضور إلا لنشاط منشور أو منتهٍ.';
  if (a.startsAt.getTime() > now.getTime()) return 'لم يبدأ النشاط بعد. سجّل الحضور بعد بدئه.';
  return null;
}

/**
 * ملخص التقييم (AC-13 «التقييم من الحاضر فقط»): يُحتسب تقييم من حالته ATTENDED الآن وحده.
 * من قيّم ثم عُلِّم «لم يحضر» يبقى تقييمه مخزّنًا (لا حذف بلا قرار) ولا يدخل المتوسط ولا الملاحظات.
 */
export function ratingSummary<T extends { status: RegistrationStatus; rating: number | null }>(
  rows: T[],
): { average: number | null; rated: T[] } {
  const rated = rows.filter((r) => r.status === 'ATTENDED' && r.rating !== null);
  const average = rated.length ? rated.reduce((s, r) => s + r.rating!, 0) / rated.length : null;
  return { average, rated };
}

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  ACTIVITY: 'نشاط',
  WORKSHOP: 'ورشة',
  EVENT: 'فعالية',
  CAMPAIGN: 'حملة',
};

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  DRAFT: 'مسودة',
  PUBLISHED: 'منشور',
  COMPLETED: 'منتهٍ',
  CANCELLED: 'ملغى',
};

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  REGISTERED: 'مسجّل',
  WAITLISTED: 'قائمة الانتظار',
  ATTENDED: 'حضر',
  NO_SHOW: 'لم يحضر',
  CANCELLED: 'ملغى',
};
