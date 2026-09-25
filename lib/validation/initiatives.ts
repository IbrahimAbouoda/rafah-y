import { z } from 'zod';
import { CURRENCIES } from '@/lib/config';
import { checkbox, intField, optionalDate, optionalText, optionalUuid, requiredDate } from './common';

// Sprint 3 — المبادرات · الاحتياجات · العروض · التمويل · المؤسسات · الطلب · Concept Note
// المبالغ نصوص عشرية بمنزلتين على الأكثر (AC-09 ②) — لا Float في أي مرحلة (§4.1).

const AMOUNT_RE = /^\d{1,10}(\.\d{1,2})?$/;
const clean = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/,/g, '') || undefined : v);

export const optionalAmount = z.preprocess(
  clean,
  z.string().regex(AMOUNT_RE, 'المبلغ رقم موجب بمنزلتين عشريتين على الأكثر، مثل 1500 أو 1500.50.').optional(),
);
export const requiredAmount = z.preprocess(
  clean,
  z
    .string({ error: 'اكتب المبلغ.' })
    .regex(AMOUNT_RE, 'المبلغ رقم موجب بمنزلتين عشريتين على الأكثر، مثل 1500 أو 1500.50.')
    .refine((v) => Number(v) > 0, 'المبلغ يجب أن يكون أكبر من صفر.'),
);

export const SUPPORT_TYPES = ['FUNDING', 'TRAINER', 'VENUE', 'EQUIPMENT', 'EXPERTISE', 'MATERIALS', 'OTHER'] as const;
export const ORGANIZATION_TYPES = [
  'LOCAL_NGO',
  'INTERNATIONAL_NGO',
  'UN_AGENCY',
  'GOVERNMENT',
  'PRIVATE_SECTOR',
  'ACADEMIC',
  'DONOR',
  'OTHER',
] as const;
export const PARTNERSHIP_STAGES = ['PROSPECT', 'CONTACTED', 'PROPOSAL_SENT', 'NEGOTIATION', 'ACTIVE', 'DORMANT'] as const;
export const INTERACTION_TYPES = ['CALL', 'MEETING', 'PROPOSAL_SENT', 'EMAIL', 'VISIT', 'OTHER'] as const;
export const INITIATIVE_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

const currency = z.enum(CURRENCIES, { error: 'العملة شيكل أو دولار.' }).default('ILS');
const initiativeId = z.uuid('المبادرة غير محددة. حدّث الصفحة.');

// ─── المبادرات ───────────────────────────────────────────────────────

export const InitiativeSchema = z.object({
  id: optionalUuid('المبادرة غير محددة.'),
  /** إنشاء من فكرة معتمدة (§5.2 «تحويل إلى مبادرة») */
  ideaId: optionalUuid('الفكرة غير محددة.'),
  committeeId: z.uuid('اختر اللجنة التي تتبعها المبادرة.'),
  title: z.string().trim().min(5, 'اكتب عنوان المبادرة (5 محارف على الأقل).').max(200, 'العنوان أطول من 200 محرف.'),
  summary: optionalText(500, 'الملخص أطول من 500 محرف.'),
  description: optionalText(5000, 'الوصف أطول من 5000 محرف.'),
  estimatedBudget: optionalAmount,
  beneficiariesTarget: z.preprocess((v) => (v === '' || v === undefined ? undefined : v), z.coerce.number().int().min(0).max(1_000_000).optional()),
  startsAt: optionalDate('اكتب تاريخ بداية صحيحًا أو اتركه فارغًا.'),
  endsAt: optionalDate('اكتب تاريخ نهاية صحيحًا أو اتركه فارغًا.'),
});

export const InitiativeProgressSchema = z.object({
  initiativeId,
  progressPct: intField('نسبة الإنجاز رقم صحيح بين 0 و 100.', 0, 100),
  beneficiariesReached: z.preprocess((v) => (v === '' || v === undefined ? undefined : v), z.coerce.number().int().min(0).max(1_000_000).optional()),
  impactSummary: optionalText(2000, 'ملخص الأثر أطول من 2000 محرف.'),
});

export const InitiativeStatusSchema = z.object({
  initiativeId,
  toStatus: z.enum(INITIATIVE_STATUSES, { error: 'الحالة غير معروفة.' }),
});

export const NeedSchema = z
  .object({
    initiativeId,
    needId: optionalUuid('الاحتياج غير محدد.'),
    // AC-09 ①: احتياج بلا نوع مرفوض
    type: z.enum(SUPPORT_TYPES, { error: 'اختر نوع الاحتياج.' }),
    description: z.string().trim().min(5, 'صف الاحتياج (5 محارف على الأقل).').max(1000, 'الوصف أطول من 1000 محرف.'),
    quantity: z.preprocess((v) => (v === '' || v === undefined ? undefined : v), z.coerce.number().int().min(1).max(100_000).optional()),
    unit: optionalText(50, 'الوحدة أطول من 50 محرفًا.'),
    amount: optionalAmount,
    sortOrder: intField('الترتيب رقم صحيح.', 0, 1000),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'FUNDING' && !v.amount) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'احتياج التمويل يحتاج مبلغًا بالشيكل.' });
    }
  });

export const NeedIdSchema = z.object({ needId: z.uuid('الاحتياج غير محدد. حدّث الصفحة.') });

export const PostUpdateSchema = z.object({
  initiativeId,
  body: z.string().trim().min(10, 'اكتب التحديث (10 محارف على الأقل).').max(3000, 'التحديث أطول من 3000 محرف.'),
  isPublic: checkbox,
});

// ─── العروض ──────────────────────────────────────────────────────────

export const SubmitOfferSchema = z
  .object({
    initiativeId,
    needId: optionalUuid('الاحتياج غير محدد.'),
    organizationId: z.uuid('اختر المؤسسة التي تقدّم العرض.'),
    // AC-10 ①: عرض بلا نوع دعم مرفوض
    types: z.array(z.enum(SUPPORT_TYPES)).min(1, 'اختر نوع دعم واحدًا على الأقل.'),
    amount: optionalAmount,
    currency,
    note: optionalText(2000, 'الملاحظات أطول من 2000 محرف.'),
  })
  .superRefine((v, ctx) => {
    // AC-10 ②: غير المالي بلا مبلغ مقبول؛ المالي يحتاج مبلغًا
    if (v.types.includes('FUNDING') && !v.amount) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'عرض التمويل يحتاج مبلغًا.' });
    }
  });

export const DecideOfferSchema = z
  .object({
    offerId: z.uuid('العرض غير محدد. حدّث الصفحة.'),
    decision: z.enum(['ACCEPTED', 'REJECTED'], { error: 'اختر: قبول أو رفض.' }),
    note: optionalText(2000, 'الملاحظة أطول من 2000 محرف.'),
    partnerRole: optionalText(100, 'دور الشريك أطول من 100 محرف.'),
  })
  .superRefine((v, ctx) => {
    if (v.decision === 'REJECTED' && (!v.note || v.note.length < 10)) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'اكتب سبب الاعتذار (10 محارف على الأقل). يصل المؤسسة.' });
    }
  });

// ─── التمويل ─────────────────────────────────────────────────────────

export const RecordFundingSchema = z.object({
  direction: z.enum(['INCOMING', 'OUTGOING'], { error: 'اختر: وارد أو مصروف.' }),
  amount: requiredAmount,
  currency,
  occurredAt: requiredDate('اكتب تاريخ الحركة.'),
  description: optionalText(1000, 'الوصف أطول من 1000 محرف.'),
  initiativeId: optionalUuid('اختر المبادرة من القائمة.'),
  organizationId: optionalUuid('اختر المؤسسة من القائمة.'),
  offerId: optionalUuid('العرض غير محدد.'),
});

export const FundingIdSchema = z.object({ fundingId: z.uuid('القيد غير محدد. حدّث الصفحة.') });

// ─── المؤسسات ────────────────────────────────────────────────────────

export const OrganizationSchema = z.object({
  id: optionalUuid('المؤسسة غير محددة.'),
  name: z.string().trim().min(2, 'اكتب اسم المؤسسة.').max(200, 'الاسم أطول من 200 محرف.'),
  type: z.enum(ORGANIZATION_TYPES, { error: 'اختر نوع المؤسسة.' }),
  country: optionalText(100, 'الدولة أطول من 100 محرف.'),
  sectors: z.preprocess(
    (v) => (typeof v === 'string' ? v.split(/[،,]/).map((s) => s.trim()).filter(Boolean) : v),
    z.array(z.string().max(60)).max(20, 'عشرون قطاعًا على الأكثر.'),
  ),
  website: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() || undefined : v),
    z.url({ protocol: /^https?$/, error: 'اكتب رابطًا يبدأ بـ https://' }).max(300).optional(),
  ),
});

export const OrganizationStageSchema = z.object({
  organizationId: z.uuid('المؤسسة غير محددة.'),
  stage: z.enum(PARTNERSHIP_STAGES, { error: 'اختر مرحلة الشراكة.' }),
});

export const InteractionSchema = z.object({
  organizationId: z.uuid('المؤسسة غير محددة.'),
  type: z.enum(INTERACTION_TYPES, { error: 'اختر نوع التواصل.' }),
  summary: z.string().trim().min(5, 'لخّص التواصل (5 محارف على الأقل).').max(2000, 'الملخص أطول من 2000 محرف.'),
  occurredAt: requiredDate('اكتب تاريخ التواصل.'),
  followUpAt: optionalDate('اكتب موعد متابعة صحيحًا أو اتركه فارغًا.'),
});

export const LinkMemberSchema = z.object({
  organizationId: z.uuid('المؤسسة غير محددة.'),
  email: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.email('اكتب بريد الحساب كما سجّل به ممثل المؤسسة.')),
  isAdmin: checkbox,
});

export const UnlinkMemberSchema = z.object({
  organizationId: z.uuid('المؤسسة غير محددة.'),
  userId: z.uuid('المستخدم غير محدد.'),
});

// ─── الطلب و Concept Note ────────────────────────────────────────────

export const CreatePollSchema = z.object({
  title: z.string().trim().min(5, 'اكتب عنوان الاستطلاع.').max(200, 'العنوان أطول من 200 محرف.'),
  description: optionalText(2000, 'الوصف أطول من 2000 محرف.'),
  proposalThreshold: intField('حد المقترح رقم صحيح بين 2 و 10000.', 2, 10_000),
  closesAt: optionalDate('اكتب تاريخ إغلاق صحيحًا أو اتركه فارغًا.'),
  initiativeId: optionalUuid('اختر المبادرة من القائمة.'),
  options: z.preprocess(
    (v) => (typeof v === 'string' ? v.split('\n').map((s) => s.trim()).filter(Boolean) : v),
    z.array(z.string().min(2).max(120)).min(2, 'اكتب خيارين على الأقل، كل خيار في سطر.').max(20, 'عشرون خيارًا على الأكثر.'),
  ),
});

export const SetThresholdSchema = z.object({
  pollId: z.uuid('الاستطلاع غير محدد.'),
  proposalThreshold: intField('حد المقترح رقم صحيح بين 2 و 10000.', 2, 10_000),
  isActive: checkbox,
});

export const DemandVoteSchema = z.object({
  pollId: z.uuid('الاستطلاع غير محدد.'),
  optionId: z.uuid('اختر مجالًا.'),
});

export const ConceptNoteIdSchema = z.object({ conceptNoteId: z.uuid('المسودة غير محددة. حدّث الصفحة.') });

export const EditConceptNoteSchema = z.object({
  conceptNoteId: z.uuid('المسودة غير محددة.'),
  title: z.string().trim().min(5).max(200, 'العنوان أطول من 200 محرف.'),
  bodyMd: z.string().trim().min(50, 'نص المقترح قصير جدًا (50 محرفًا على الأقل).').max(20_000, 'النص أطول من 20000 محرف.'),
});
