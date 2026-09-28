import { z } from 'zod';
import { gazaDayStart } from '@/lib/utils';
import { optionalText } from './common';

// Sprint 5 — التقارير (PRD §4.11 · AC-15)

export const REPORT_PERIODS = ['MONTHLY', 'QUARTERLY', 'ANNUAL', 'CUSTOM'] as const;

export const PERIOD_LABELS: Record<(typeof REPORT_PERIODS)[number], string> = {
  MONTHLY: 'شهري',
  QUARTERLY: 'ربع سنوي',
  ANNUAL: 'سنوي',
  CUSTOM: 'فترة مخصّصة',
};

const day = (message: string) => z.string().trim().refine((v) => gazaDayStart(v) !== null, message);

export const GenerateReportSchema = z
  .object({
    title: z.string().trim().min(3, 'اكتب عنوانًا للتقرير من 3 محارف على الأقل.').max(200, 'العنوان 200 محرف على الأكثر.'),
    period: z.enum(REPORT_PERIODS, { error: 'اختر نوع الفترة.' }),
    from: day('اختر تاريخ بداية الفترة.'),
    to: day('اختر تاريخ نهاية الفترة.'),
    summary: optionalText(5000, 'الملخص 5000 محرف على الأكثر.'),
  })
  .refine((d) => d.from <= d.to, { path: ['to'], message: 'نهاية الفترة يجب أن تكون في يوم بدايتها أو بعده.' });

export const ReportIdSchema = z.object({ reportId: z.uuid('التقرير غير محدد. حدّث الصفحة وأعد المحاولة.') });
