import type {
  ApplicationStatus,
  ApplyMode,
  EducationLevel,
  OpportunityStatus,
  OpportunityType,
  SkillLevel,
} from '@/lib/generated/prisma/enums';

// مسار الفرصة وطلبها — PRD §5.4 · AC-11 · D31 · D33. المصدر الوحيد للانتقالات المسموحة.

/** مراجعة الفرصة (opportunities:publish): المؤسسة تنشئها PENDING_REVIEW، وأمانة السر تنشرها أو ترفضها */
export const OPPORTUNITY_REVIEW: Record<OpportunityStatus, OpportunityStatus[]> = {
  DRAFT: [],
  PENDING_REVIEW: ['PUBLISHED', 'REJECTED'],
  PUBLISHED: [],
  REJECTED: [],
  CLOSED: [],
};

/**
 * هل تُنشر الفرصة الآن؟ null = تُنشر · نص = السبب. الرفض يبقى مسموحًا دائمًا.
 * فرصة انتهى موعدها قبل مراجعتها لا تُنشر: ستظهر ميتة لا تقبل طلبًا.
 */
export function publishBlocker(o: { deadline: Date | null }, now = new Date()): string | null {
  if (o.deadline && o.deadline.getTime() < now.getTime()) {
    return 'انتهى موعد التقديم على هذه الفرصة قبل مراجعتها، فلا تُنشر. ارفضها أو اطلب من المؤسسة إرسالها بموعد جديد.';
  }
  return null;
}

/** إغلاق فرصة منشورة — من المؤسسة صاحبتها أو ممن يملك opportunities:publish */
export const CLOSABLE_OPPORTUNITY_STATUSES: OpportunityStatus[] = ['PUBLISHED'];

/**
 * هل تقبل الفرصة طلبًا داخل المنصة الآن؟ (AC-11 ④ · §5.4)
 * null = تقبل · نص = سبب الرفض بالعربية
 */
export function applyBlocker(
  o: { status: OpportunityStatus; applyMode: ApplyMode; deadline: Date | null },
  now = new Date(),
): string | null {
  if (o.status !== 'PUBLISHED') return 'هذه الفرصة غير منشورة أو أُغلقت، فلا تقبل طلبات.';
  if (o.applyMode === 'EXTERNAL') return 'التقديم على هذه الفرصة عبر رابط الجهة الرسمي، لا داخل المنصة.';
  if (o.deadline && o.deadline.getTime() < now.getTime()) return 'انتهى موعد التقديم على هذه الفرصة.';
  return null;
}

/** تظهر في /opportunities: منشورة ولم ينتهِ موعدها */
export function isOpenOpportunity(o: { status: OpportunityStatus; deadline: Date | null }, now = new Date()): boolean {
  return o.status === 'PUBLISHED' && (!o.deadline || o.deadline.getTime() >= now.getTime());
}

// ─── الطلب — D33 ──────────────────────────────────────────────────────
// المؤسسة تغيّر حالة الطلب الموافق صاحبه على مشاركة ملفه فقط (بلا ملف لا تعرف من تقبل)،
// والمتقدّم يسحب طلبه ما دام غير محسوم.

export const APPLICATION_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'ACCEPTED', 'REJECTED'],
  UNDER_REVIEW: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export const WITHDRAWABLE_APPLICATION_STATUSES: ApplicationStatus[] = ['SUBMITTED', 'UNDER_REVIEW'];

export function nextApplicationStatuses(from: ApplicationStatus, shareProfile: boolean): ApplicationStatus[] {
  return shareProfile ? APPLICATION_TRANSITIONS[from] : [];
}

// ─── ما يُشارك مع المؤسسة — D31 (Q12) ─────────────────────────────────
// المصدر الواحد لنص ConsentDialog ولما يعيده viewApplicant: ما يُعرض على الشاب هو بالضبط ما يصل.

export const PROFILE_DATA_POINTS = [
  'اسمك الكامل',
  'بريدك الإلكتروني ورقم جوّالك (إن وُجدا في حسابك)',
  'سنة ميلادك ومنطقتك ومستواك التعليمي',
  'لغاتك واهتماماتك، وهل تبحث عن عمل',
  'مهاراتك ومستوى كل منها',
] as const;

export const APPLICANT_DATA_POINTS = [...PROFILE_DATA_POINTS, 'رسالتك المرفقة بالطلب'] as const;

export type ApplicantView = {
  applicationId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  birthYear: number | null;
  area: string | null;
  educationLevel: EducationLevel | null;
  languages: string[];
  interests: string[];
  jobSeeking: boolean;
  skills: { name: string; level: SkillLevel }[];
  message: string | null;
};

// ─── التسميات ─────────────────────────────────────────────────────────

export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
  JOB: 'وظيفة',
  TRAINING: 'تدريب',
  GRANT: 'منحة',
  AID: 'مساعدة',
  VOLUNTEER: 'تطوّع',
  OTHER: 'أخرى',
};

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  DRAFT: 'مسودة',
  PENDING_REVIEW: 'بانتظار المراجعة',
  PUBLISHED: 'منشورة',
  REJECTED: 'مرفوضة',
  CLOSED: 'مغلقة',
};

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  SUBMITTED: 'مُرسل',
  UNDER_REVIEW: 'قيد الدراسة',
  ACCEPTED: 'مقبول',
  REJECTED: 'غير مقبول',
  WITHDRAWN: 'مسحوب',
};

export const EDUCATION_LABELS: Record<EducationLevel, string> = {
  NONE: 'بلا تعليم نظامي',
  PRIMARY: 'أساسي',
  SECONDARY: 'ثانوي',
  VOCATIONAL: 'مهني',
  DIPLOMA: 'دبلوم',
  BACHELOR: 'بكالوريوس',
  POSTGRADUATE: 'دراسات عليا',
};

export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  BEGINNER: 'مبتدئ',
  INTERMEDIATE: 'متوسط',
  ADVANCED: 'متقدّم',
};
