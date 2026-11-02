import { z } from 'zod';
import { gazaDateTime, gazaDayStart } from '@/lib/utils';
import { checkbox, optionalText, optionalUuid } from './common';

// Sprint 4 — الملف · الفرص · الأنشطة (PRD §4.4 · §4.9 · §5.4 · §5.5)

export const OPPORTUNITY_TYPES = ['JOB', 'TRAINING', 'GRANT', 'AID', 'VOLUNTEER', 'OTHER'] as const;
export const ACTIVITY_KINDS = ['ACTIVITY', 'WORKSHOP', 'EVENT', 'CAMPAIGN'] as const;
export const ACTIVITY_STATUSES = ['DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED'] as const;
export const EDUCATION_LEVELS = ['NONE', 'PRIMARY', 'SECONDARY', 'VOCATIONAL', 'DIPLOMA', 'BACHELOR', 'POSTGRADUATE'] as const;
export const SKILL_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;

const blankToUndefined = (v: unknown) => (v === '' || v === undefined || v === null ? undefined : v);
const optionalInt = (message: string, min: number, max: number) =>
  z.preprocess(blankToUndefined, z.coerce.number({ error: message }).int(message).min(min, message).max(max, message).optional());

/** قائمة نصية مفصولة بفواصل (عربية أو لاتينية) ← مصفوفة بلا تكرار */
const commaList = (label: string) =>
  z.preprocess(
    (v) =>
      typeof v === 'string'
        ? [...new Set(v.split(/[,،\n]/).map((s) => s.trim()).filter(Boolean))]
        : Array.isArray(v)
          ? v
          : [],
    z.array(z.string().max(60, `كل عنصر في ${label} 60 محرفًا على الأكثر.`)).max(15, `${label}: 15 عنصرًا على الأكثر.`),
  );

// ─── الملف ────────────────────────────────────────────────────────────

/** «آخر موعد» بتاريخ فقط = نهاية ذلك اليوم بتوقيت غزة، لا بدايته */
const endOfGazaDay = z.preprocess((v) => {
  if (v === '' || v === undefined || v === null) return undefined;
  const start = typeof v === 'string' ? gazaDayStart(v) : null;
  return start ? new Date(start.getTime() + 24 * 3600_000 - 1) : v;
}, z.coerce.date({ error: 'اكتب موعدًا نهائيًا صحيحًا أو اتركه فارغًا.' }).optional());

/** موعد من <input type="datetime-local"> بتوقيت غزة (الخادم قد يعمل بتوقيت آخر) */
const toGazaMoment = (v: unknown) => {
  if (v === '' || v === undefined || v === null) return undefined;
  return typeof v === 'string' ? (gazaDateTime(v) ?? v) : v;
};
const gazaMoment = (message: string) => z.preprocess(toGazaMoment, z.coerce.date({ error: message }));
const optionalGazaMoment = (message: string) => z.preprocess(toGazaMoment, z.coerce.date({ error: message }).optional());

export const ProfileSchema = z.object({
  // لا تاريخ ميلاد كامل (§4.4)
  // الحدود من السنة الحالية عند كل تحقق، لا عند تحميل الوحدة (خادم يعمل عبر رأس السنة)
  birthYear: z
    .preprocess(blankToUndefined, z.coerce.number({ error: 'سنة الميلاد رقم من أربع خانات، مثل 2003.' }).int('سنة الميلاد رقم من أربع خانات، مثل 2003.').optional())
    .superRefine((v, ctx) => {
      if (v === undefined) return;
      const year = new Date().getFullYear();
      if (v < year - 60 || v > year - 10) ctx.addIssue({ code: 'custom', message: `سنة الميلاد رقم بين ${year - 60} و ${year - 10}.` });
    }),
  areaId: optionalUuid('اختر المنطقة من القائمة.'),
  educationLevel: z.preprocess(blankToUndefined, z.enum(EDUCATION_LEVELS, { error: 'اختر المستوى التعليمي من القائمة.' }).optional()),
  languages: commaList('اللغات'),
  interests: commaList('الاهتمامات'),
  jobSeeking: checkbox,
  /** مهارات: skill:<id> = المستوى، أو فارغ لحذفها */
  skills: z
    .array(z.object({ skillId: z.uuid('المهارة غير معروفة.'), level: z.enum(SKILL_LEVELS, { error: 'اختر مستوى المهارة.' }) }))
    .max(30, 'اختر 30 مهارة على الأكثر.'),
});

export const ConsentSchema = z.object({
  shareWithPartners: checkbox,
});

// ─── الفرص ────────────────────────────────────────────────────────────

export const OpportunitySchema = z
  .object({
    organizationId: z.uuid('اختر المؤسسة التي تنشر الفرصة.'),
    title: z.string().trim().min(5, 'اكتب عنوان الفرصة (5 محارف على الأقل).').max(200, 'العنوان أطول من 200 محرف.'),
    description: z.string().trim().min(20, 'صف الفرصة وشروطها (20 محرفًا على الأقل).').max(5000, 'الوصف أطول من 5000 محرف.'),
    type: z.enum(OPPORTUNITY_TYPES, { error: 'اختر نوع الفرصة.' }),
    applyMode: z.enum(['INTERNAL', 'EXTERNAL'], { error: 'اختر طريقة التقديم.' }),
    externalUrl: z.preprocess(blankToUndefined, z.url({ protocol: /^https?$/, error: 'اكتب رابطًا كاملًا يبدأ بـ https://' }).max(500).optional()),
    seats: optionalInt('عدد المقاعد رقم صحيح بين 1 و 10000.', 1, 10_000),
    deadline: endOfGazaDay,
    areaId: optionalUuid('اختر المنطقة من القائمة.'),
    skillIds: z.array(z.uuid('المهارة غير معروفة.')).max(15, 'اختر 15 مهارة على الأكثر.'),
  })
  .superRefine((v, ctx) => {
    if (v.applyMode === 'EXTERNAL' && !v.externalUrl) {
      ctx.addIssue({ code: 'custom', path: ['externalUrl'], message: 'الفرصة الخارجية تحتاج رابط التقديم الرسمي.' });
    }
    if (v.deadline && v.deadline.getTime() < Date.now()) {
      ctx.addIssue({ code: 'custom', path: ['deadline'], message: 'الموعد النهائي مضى. اختر تاريخًا قادمًا.' });
    }
  });

const opportunityId = z.uuid('الفرصة غير محددة. حدّث الصفحة.');
const applicationId = z.uuid('الطلب غير محدد. حدّث الصفحة.');

export const ReviewOpportunitySchema = z.object({
  opportunityId,
  decision: z.enum(['PUBLISHED', 'REJECTED'], { error: 'اختر: نشر أو رفض.' }),
});

export const OpportunityIdSchema = z.object({ opportunityId });

export const ApplySchema = z.object({
  opportunityId,
  message: optionalText(2000, 'الرسالة أطول من 2000 محرف.'),
  // الموافقة صريحة لكل طلب (§6.8): غيابها = لا مشاركة
  shareProfile: checkbox,
});

export const ApplicationIdSchema = z.object({ applicationId });

export const ApplicationStatusSchema = z.object({
  applicationId,
  toStatus: z.enum(['UNDER_REVIEW', 'ACCEPTED', 'REJECTED'], { error: 'الحالة غير معروفة.' }),
});

// ─── الأنشطة ──────────────────────────────────────────────────────────

export const ActivitySchema = z
  .object({
    id: optionalUuid('النشاط غير محدد.'),
    // D34: كل نشاط تتبعه لجنة — الحضور صلاحية بنطاق اللجنة وحدها
    committeeId: z.uuid('اختر اللجنة المنظِّمة.'),
    title: z.string().trim().min(5, 'اكتب عنوان النشاط (5 محارف على الأقل).').max(200, 'العنوان أطول من 200 محرف.'),
    description: optionalText(5000, 'الوصف أطول من 5000 محرف.'),
    kind: z.enum(ACTIVITY_KINDS, { error: 'اختر نوع النشاط.' }),
    startsAt: gazaMoment('اكتب موعد بداية النشاط.'),
    endsAt: optionalGazaMoment('اكتب موعد نهاية صحيحًا أو اتركه فارغًا.'),
    location: optionalText(200, 'المكان أطول من 200 محرف.'),
    areaId: optionalUuid('اختر المنطقة من القائمة.'),
    seats: optionalInt('عدد المقاعد رقم صحيح بين 1 و 10000.', 1, 10_000),
    registrationOpen: checkbox,
    outcomes: optionalText(5000, 'المخرجات أطول من 5000 محرف.'),
    partnerIds: z.array(z.uuid('المؤسسة غير معروفة.')).max(20, 'اختر 20 مؤسسة على الأكثر.'),
  })
  .superRefine((v, ctx) => {
    if (v.endsAt && v.endsAt.getTime() < v.startsAt.getTime()) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'موعد النهاية قبل موعد البداية.' });
    }
  });

/** النشاط المنتهي أو الملغى: المخرجات وحدها (§5.5) */
export const ActivityOutcomesSchema = z.object({
  id: z.uuid('النشاط غير محدد. حدّث الصفحة.'),
  outcomes: optionalText(5000, 'المخرجات أطول من 5000 محرف.'),
});

export const ActivityStatusSchema = z.object({
  activityId: z.uuid('النشاط غير محدد. حدّث الصفحة.'),
  toStatus: z.enum(ACTIVITY_STATUSES, { error: 'الحالة غير معروفة.' }),
});

export const ActivityIdSchema = z.object({ activityId: z.uuid('النشاط غير محدد. حدّث الصفحة.') });

export const RateSchema = z.object({
  activityId: z.uuid('النشاط غير محدد. حدّث الصفحة.'),
  // الحد 1–5 هنا للرسالة الواضحة، وقيد activity_registrations_rating_range في القاعدة هو الضمان
  rating: z.coerce.number({ error: 'اختر تقييمًا من 1 إلى 5.' }).int('اختر تقييمًا من 1 إلى 5.').min(1, 'اختر تقييمًا من 1 إلى 5.').max(5, 'اختر تقييمًا من 1 إلى 5.'),
  feedback: optionalText(1000, 'الملاحظات أطول من 1000 محرف.'),
});

export const AttendanceSchema = z.object({
  activityId: z.uuid('النشاط غير محدد. حدّث الصفحة.'),
  marks: z
    .array(z.object({ registrationId: z.uuid('التسجيل غير معروف.'), status: z.enum(['ATTENDED', 'NO_SHOW'], { error: 'اختر: حضر أو لم يحضر.' }) }))
    .min(1, 'علّم حضور مشارك واحد على الأقل.'),
});
