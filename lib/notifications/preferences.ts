import type { NotificationType } from '@/lib/generated/prisma/enums';

// §8.2 · §8.3 — الأنواع التي لها قناة بريد في مصفوفة الأحداث، وهي وحدها ما يُوقَف بريده.
// داخل المنصة لا يُوقف أبدًا (§8.3)، والأنواع الداخلية فقط (تذكير المهمة، نشر فرصة، استفسار بلا إجابة) لا بريد لها أصلًا.

export const EMAIL_TYPES = [
  'COMPLAINT_RECEIVED',
  'COMPLAINT_ASSIGNED',
  'COMPLAINT_STATUS_CHANGED',
  'COMPLAINT_RESOLVED',
  'TASK_ASSIGNED',
  'IDEA_DECIDED',
  'OFFER_RECEIVED',
  'OFFER_DECIDED',
  'APPLICATION_STATUS_CHANGED',
  'INQUIRY_ANSWERED',
] as const satisfies readonly NotificationType[];

export type EmailType = (typeof EMAIL_TYPES)[number];

export const EMAIL_TYPE_LABELS: Record<EmailType, { label: string; who: string }> = {
  COMPLAINT_RECEIVED: { label: 'استلام شكواك', who: 'مقدّم الشكوى' },
  COMPLAINT_ASSIGNED: { label: 'تحويل شكوى للجنة', who: 'مقدّم الشكوى ورئيس اللجنة' },
  COMPLAINT_STATUS_CHANGED: { label: 'تغيّر حالة شكواك', who: 'مقدّم الشكوى' },
  COMPLAINT_RESOLVED: { label: 'حل شكواك أو إغلاقها', who: 'مقدّم الشكوى' },
  TASK_ASSIGNED: { label: 'إسناد مهمة إليك', who: 'أعضاء اللجان' },
  IDEA_DECIDED: { label: 'قرار على فكرتك', who: 'صاحب الفكرة' },
  OFFER_RECEIVED: { label: 'وصول عرض دعم', who: 'الرئيس وأمين السر' },
  OFFER_DECIDED: { label: 'قرار على عرض الدعم', who: 'المؤسسات' },
  APPLICATION_STATUS_CHANGED: { label: 'تغيّر حالة طلبك على فرصة', who: 'المتقدّمون' },
  INQUIRY_ANSWERED: { label: 'رد على استفسارك', who: 'صاحب الاستفسار' },
};

/** الأنواع التي أوقف المستخدم بريدها — الغياب = مفعّل (الافتراضي في النموذج) */
export const disabledSet = (rows: { type: string; enabled: boolean }[]) =>
  new Set(rows.filter((r) => !r.enabled).map((r) => r.type));
