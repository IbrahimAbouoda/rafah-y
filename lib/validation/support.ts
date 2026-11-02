import { z } from 'zod';
import { checkbox, optionalText, optionalUuid } from './common';

// Sprint 5 — المحور ٥: البوت والاستفسارات و FAQ (PRD §13 · §4.12)

const keywordList = z.preprocess(
  (v) => (typeof v === 'string' ? [...new Set(v.split(/[,،\n]/).map((s) => s.trim()).filter(Boolean))] : Array.isArray(v) ? v : []),
  z.array(z.string().max(60, 'كل كلمة مفتاحية 60 محرفًا على الأكثر.')).max(15, 'الكلمات المفتاحية: 15 على الأكثر.'),
);

export const AskBotSchema = z.object({
  question: z.string().trim().min(3, 'اكتب سؤالك بثلاثة محارف على الأقل.').max(500, 'السؤال 500 محرف على الأكثر.'),
});

export const BotQueryIdSchema = z.object({ botQueryId: z.uuid('انتهت جلسة السؤال. اسأل مرة أخرى.') });

export const SendInquirySchema = z.object({
  question: z.string().trim().min(5, 'اكتب استفسارك بخمسة محارف على الأقل.').max(2000, 'الاستفسار 2000 محرف على الأكثر.'),
  botQueryId: optionalUuid('انتهت جلسة السؤال. اسأل مرة أخرى.'),
  contactHint: optionalText(120, 'وسيلة التواصل 120 محرفًا على الأكثر.'),
});

export const InquiryIdSchema = z.object({ inquiryId: z.uuid('الاستفسار غير محدد. حدّث الصفحة وأعد المحاولة.') });

export const AnswerInquirySchema = InquiryIdSchema.extend({
  answer: z.string().trim().min(5, 'اكتب الرد بخمسة محارف على الأقل.').max(5000, 'الرد 5000 محرف على الأكثر.'),
  promote: checkbox,
  faqQuestion: optionalText(300, 'نص السؤال 300 محرف على الأكثر.'),
  categoryId: optionalUuid('اختر تصنيف السؤال.'),
  keywords: keywordList,
}).refine((d) => !d.promote || d.categoryId, { path: ['categoryId'], message: 'اختر تصنيفًا لإضافة الرد إلى الأسئلة الشائعة.' });

export const FaqSchema = z.object({
  faqId: optionalUuid('السؤال غير محدد.'),
  categoryId: z.uuid('اختر تصنيف السؤال.'),
  question: z.string().trim().min(5, 'اكتب السؤال بخمسة محارف على الأقل.').max(300, 'السؤال 300 محرف على الأكثر.'),
  answer: z.string().trim().min(5, 'اكتب الإجابة بخمسة محارف على الأقل.').max(5000, 'الإجابة 5000 محرف على الأكثر.'),
  keywords: keywordList,
});

export const FaqActiveSchema = z.object({ faqId: z.uuid('السؤال غير محدد.'), active: checkbox });
