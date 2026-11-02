import { z } from 'zod';
import { optionalDate } from './common';

// فلتر التقرير الإداري والمالي — /admin/reports?view=financial&from&to&pending
export const ReportFilterSchema = z
  .object({
    from: optionalDate('تاريخ بداية الفترة غير صحيح.'),
    to: optionalDate('تاريخ نهاية الفترة غير صحيح.'),
    pending: z.preprocess((v) => v === '1', z.boolean()),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: 'بداية الفترة بعد نهايتها. صحّح التاريخين.' });
