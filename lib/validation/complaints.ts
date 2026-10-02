import { z } from 'zod';
import { checkbox, optionalDate, optionalText, optionalUuid } from './common';

// مخططات الشكاوى — PRD §6.3: العنوان ≤ 200 · النص ≤ 5000 · التفاصيل ≥ 20.
// تُستخدم على الخادم دائمًا، وفي العميل للتجربة فقط.

export const COMPLAINT_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'ASSIGNED',
  'COMMITTEE_REVIEW',
  'REFERRED',
  'WAITING_RESPONSE',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'DISMISSED',
] as const;

export const CONTACT_CHANNELS = ['PHONE', 'EMAIL', 'WHATSAPP'] as const;
export const REFERRAL_TARGETS = ['MUNICIPALITY', 'ORGANIZATION', 'GOVERNMENT', 'LEGAL', 'OTHER'] as const;

// §6.5: القائمة البيضاء والحدود — تعريفها في lib/files.ts (يستوردها العميل بلا zod)
import { MAX_FILES_PER_RECORD, MAX_UPLOAD_BYTES, UPLOAD_MIME_TYPES } from '@/lib/files';
export { MAX_FILES_PER_RECORD, MAX_UPLOAD_BYTES, UPLOAD_MIME_TYPES };

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z.preprocess((v) => (v === '' ? undefined : v), z.enum(values, { error: message }).optional());

export const SubmitComplaintSchema = z
  .object({
    clientDraftId: z.uuid('معرّف المسودة غير صالح. أعد تحميل الصفحة ثم أرسل.'),
    title: z.string().trim().min(5, 'اكتب عنوانًا يصف المشكلة (5 محارف على الأقل).').max(200, 'العنوان أطول من 200 محرف.'),
    body: z
      .string()
      .trim()
      .min(20, 'اشرح المشكلة بتفصيل أكثر (20 محرفًا على الأقل): ماذا حدث، وأين، ومنذ متى.')
      .max(5000, 'التفاصيل أطول من 5000 محرف. اختصرها أو أرفق ملفًا.'),
    categoryId: z.uuid('اختر تصنيف الشكوى.'),
    areaId: optionalUuid('اختر المنطقة من القائمة أو اتركها فارغة.'),
    isAnonymous: checkbox,
    contactName: optionalText(100, 'الاسم أطول من 100 محرف.'),
    contactPhone: z.preprocess(
      (v) => (typeof v === 'string' ? v.replace(/[\s-]/g, '') || undefined : v),
      z.string().regex(/^\+?[0-9]{7,15}$/, 'اكتب رقم جوّال صحيحًا بالأرقام فقط، مثل 0599123456.').optional(),
    ),
    contactEmail: z.preprocess(
      (v) => (typeof v === 'string' ? v.trim().toLowerCase() || undefined : v),
      z.email('اكتب بريدًا إلكترونيًا صحيحًا أو اتركه فارغًا.').max(200, 'البريد أطول من 200 محرف.').optional(),
    ),
    preferredChannel: optionalEnum(CONTACT_CHANNELS, 'اختر وسيلة التواصل من القائمة.'),
  })
  .superRefine((v, ctx) => {
    // §6.7: الشكوى المجهولة تظهر للّجنة بمحتواها فقط — لا بيانات تواصل معها
    if (v.isAnonymous && (v.contactName || v.contactPhone || v.contactEmail)) {
      ctx.addIssue({
        code: 'custom',
        path: ['isAnonymous'],
        message: 'الشكوى المجهولة لا تحمل بيانات تواصل. امسح بيانات التواصل أو ألغِ إخفاء الهوية.',
      });
    }
    if (v.preferredChannel === 'EMAIL' && !v.contactEmail) {
      ctx.addIssue({ code: 'custom', path: ['contactEmail'], message: 'اخترت البريد وسيلةً للتواصل: اكتب بريدك.' });
    }
    if ((v.preferredChannel === 'PHONE' || v.preferredChannel === 'WHATSAPP') && !v.contactPhone) {
      ctx.addIssue({ code: 'custom', path: ['contactPhone'], message: 'اخترت الهاتف وسيلةً للتواصل: اكتب رقمك.' });
    }
  });

export type SubmitComplaintInput = z.infer<typeof SubmitComplaintSchema>;

export const referenceField = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v),
  z.string().regex(/^RF-CMP-\d{4}-\d{6}$/, 'اكتب الرقم المرجعي كما وصلك، مثل RF-CMP-2026-000124.'),
);

export const accessCodeField = z.preprocess(
  (v) => (typeof v === 'string' ? v.toUpperCase().replace(/[\s-]/g, '') : v),
  z.string().regex(/^[A-Z0-9]{8}$/, 'رمز المتابعة 8 خانات من حروف إنجليزية وأرقام، كما ظهر لك عند التقديم.'),
);

export const TrackSchema = z.object({ reference: referenceField, accessCode: accessCodeField });

const complaintId = z.uuid('الشكوى غير محددة. حدّث الصفحة.');

export const ComplaintIdSchema = z.object({ complaintId });

export const AssignComplaintSchema = z.object({
  complaintId,
  committeeId: z.uuid('اختر اللجنة التي تُحوَّل إليها الشكوى.'),
  note: optionalText(1000, 'تعليق التحويل أطول من 1000 محرف.'),
  /** D23: موعد متابعة التحويل للجنة */
  followUpAt: optionalDate('اكتب موعد متابعة صحيحًا أو اتركه فارغًا.'),
});

export const UpdateStatusSchema = z
  .object({
    complaintId,
    toStatus: z.enum(COMPLAINT_STATUSES, { error: 'اختر الحالة التالية.' }),
    note: optionalText(2000, 'الملاحظة أطول من 2000 محرف.'),
    isPublic: checkbox,
    /** رد الجهة الخارجية عند الانتقال من WAITING_RESPONSE */
    response: optionalText(2000, 'الرد أطول من 2000 محرف.'),
    /** D23: تحديث موعد المتابعة مع الانتقال (فارغ = بلا تغيير) */
    followUpAt: optionalDate('اكتب موعد متابعة صحيحًا أو اتركه فارغًا.'),
  })
  .superRefine((v, ctx) => {
    if (v.toStatus === 'RESOLVED' && (!v.note || v.note.length < 10)) {
      ctx.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'اكتب ملاحظة الحل (10 محارف على الأقل): ماذا فُعل. تظهر لمقدّم الشكوى.',
      });
    }
  });

export const ReferComplaintSchema = z.object({
  complaintId,
  target: z.enum(REFERRAL_TARGETS, { error: 'اختر نوع الجهة.' }),
  targetName: z.string().trim().min(2, 'اكتب اسم الجهة المحوَّل إليها.').max(200, 'اسم الجهة أطول من 200 محرف.'),
  followUpAt: optionalDate('اكتب موعد متابعة صحيحًا أو اتركه فارغًا.'),
  note: optionalText(2000, 'الملاحظة أطول من 2000 محرف.'),
});

export const CloseComplaintSchema = z.object({
  complaintId,
  note: optionalText(1000, 'الملاحظة أطول من 1000 محرف.'),
});

export const DismissComplaintSchema = z.object({
  complaintId,
  reason: z
    .string()
    .trim()
    .min(10, 'اكتب سبب الاستبعاد (10 محارف على الأقل)، مثل: مكررة مع الشكوى RF-CMP-…')
    .max(1000, 'السبب أطول من 1000 محرف.'),
});

export const CreateUploadSchema = z.object({
  reference: referenceField,
  accessCode: accessCodeField,
  fileName: z.string().trim().min(1, 'اسم الملف مفقود.').max(200, 'اسم الملف أطول من 200 محرف.'),
  mimeType: z.enum(UPLOAD_MIME_TYPES, { error: 'نوع الملف غير مسموح. المسموح: صور JPG أو PNG أو WEBP، أو ملف PDF.' }),
  sizeBytes: z.coerce
    .number()
    .int()
    .min(1, 'الملف فارغ.')
    .max(MAX_UPLOAD_BYTES, 'حجم الملف أكبر من 5 ميجابايت. صغّره ثم أعد المحاولة.'),
  sha256: z.string().regex(/^[a-f0-9]{64}$/, 'تعذّر حساب بصمة الملف. أعد اختياره.'),
});

export const ConfirmUploadSchema = z.object({
  reference: referenceField,
  accessCode: accessCodeField,
  fileId: z.uuid('الملف غير محدد.'),
});

export const FileIdSchema = z.object({ fileId: z.uuid('الملف غير محدد. حدّث الصفحة.') });

export const NotificationIdSchema = z.object({ notificationId: z.uuid('الإشعار غير محدد. حدّث الصفحة.') });
