import { z } from 'zod';

// Sprint 5 — المحور ٣: مدخلات التصدير (المرشّحات نفسها في الصفحات)

const optionalFilter = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().max(max).optional());

export const ExportComplaintsSchema = z.object({
  status: optionalFilter(40),
  committee: optionalFilter(40),
  q: optionalFilter(200),
});

export const ExportApplicantsSchema = z.object({ opportunityId: z.uuid('الفرصة غير محددة. حدّث الصفحة وأعد المحاولة.') });

export const ExportAttendanceSchema = z.object({ activityId: z.uuid('النشاط غير محدد. حدّث الصفحة وأعد المحاولة.') });
