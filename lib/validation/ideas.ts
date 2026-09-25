import { z } from 'zod';
import { optionalText, optionalUuid } from './common';

// AC-07: وصف المشكلة ≥ 20 محرفًا · العنوان ≤ 200 · النصوص ≤ 5000 (حدود المخطط)

const money = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().replace(/,/g, '') || undefined : v),
  z
    .string()
    .regex(/^\d{1,10}(\.\d{1,2})?$/, 'الكلفة رقم موجب بمنزلتين عشريتين على الأكثر، مثل 1500 أو 1500.50.')
    .optional(),
);

export const SubmitIdeaSchema = z.object({
  clientDraftId: z.uuid('معرّف المسودة غير صالح. أعد تحميل الصفحة ثم أرسل.'),
  title: z.string().trim().min(5, 'اكتب عنوانًا للفكرة (5 محارف على الأقل).').max(200, 'العنوان أطول من 200 محرف.'),
  problem: z
    .string()
    .trim()
    .min(20, 'صف المشكلة بتفصيل أكثر (20 محرفًا على الأقل): ما هي، ومن تمسّ.')
    .max(5000, 'وصف المشكلة أطول من 5000 محرف.'),
  solution: z
    .string()
    .trim()
    .min(20, 'اشرح الحل المقترح (20 محرفًا على الأقل): ماذا نفعل، وكيف.')
    .max(5000, 'وصف الحل أطول من 5000 محرف.'),
  estimatedCost: money,
  areaId: optionalUuid('اختر المنطقة من القائمة أو اتركها فارغة.'),
});

export type SubmitIdeaInput = z.infer<typeof SubmitIdeaSchema>;

/** CHANGES_REQUESTED ← صاحبها يعدّل المشكلة والحل والكلفة */
export const ReviseIdeaSchema = z.object({
  ideaId: z.uuid('الفكرة غير محددة. حدّث الصفحة.'),
  title: SubmitIdeaSchema.shape.title,
  problem: SubmitIdeaSchema.shape.problem,
  solution: SubmitIdeaSchema.shape.solution,
  estimatedCost: money,
});

const ideaId = z.uuid('الفكرة غير محددة. حدّث الصفحة.');

export const IdeaIdSchema = z.object({ ideaId });

export const ReviewIdeaSchema = z
  .object({
    ideaId,
    toStatus: z.enum(['SCREENING', 'COMMITTEE_REVIEW', 'CHANGES_REQUESTED'], { error: 'اختر الخطوة التالية.' }),
    committeeId: optionalUuid('اختر اللجنة من القائمة.'),
    note: optionalText(2000, 'الملاحظة أطول من 2000 محرف.'),
  })
  .superRefine((v, ctx) => {
    if (v.toStatus === 'COMMITTEE_REVIEW' && !v.committeeId) {
      ctx.addIssue({ code: 'custom', path: ['committeeId'], message: 'اختر اللجنة التي تراجع الفكرة.' });
    }
    if (v.toStatus === 'CHANGES_REQUESTED' && (!v.note || v.note.length < 10)) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'اكتب ما المطلوب تعديله (10 محارف على الأقل). يصل صاحب الفكرة.' });
    }
  });

export const MergeIdeaSchema = z.object({
  ideaId,
  intoReference: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v),
    z.string().regex(/^RF-IDA-\d{4}-\d{6}$/, 'اكتب رقم الفكرة الأصلية، مثل RF-IDA-2026-000031.'),
  ),
  note: optionalText(1000, 'الملاحظة أطول من 1000 محرف.'),
});

export const DecideIdeaSchema = z
  .object({
    ideaId,
    decision: z.enum(['APPROVED', 'REJECTED'], { error: 'اختر: اعتماد أو رفض.' }),
    note: optionalText(2000, 'الملاحظة أطول من 2000 محرف.'),
  })
  .superRefine((v, ctx) => {
    // الرفض = أرشفة المقترح (D24): السبب إلزامي ويصل صاحبه
    if (v.decision === 'REJECTED' && (!v.note || v.note.length < 10)) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'اكتب سبب الرفض (10 محارف على الأقل). يصل صاحب الفكرة.' });
    }
  });
