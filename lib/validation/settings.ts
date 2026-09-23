import { z } from 'zod';
import { checkbox, intField, optionalDate, optionalText, optionalUuid, requiredDate } from './common';

export const AssignRoleSchema = z.object({
  userId: z.uuid('المستخدم غير محدد. أعد فتح صفحة المستخدم.'),
  roleId: z.uuid('اختر الدور.'),
  committeeId: optionalUuid('اختر لجنة من القائمة.'),
  title: optionalText(100, 'المسمّى أطول من 100 محرف.'),
  /** للإنابة المؤقتة: الدور ينتهي تلقائيًا في هذا التاريخ (PRD §2 P3) */
  endsAt: optionalDate('اكتب تاريخ انتهاء صحيحًا أو اتركه فارغًا.'),
});

export const RevokeRoleSchema = z.object({
  assignmentId: z.uuid('التعيين غير محدد. حدّث الصفحة.'),
});

export const StartTermSchema = z
  .object({
    name: z.string().trim().min(3, 'اكتب اسم الدورة (3 محارف على الأقل).').max(100, 'الاسم أطول من 100 محرف.'),
    startsAt: requiredDate('اكتب تاريخ بداية صحيحًا.'),
    endsAt: optionalDate('اكتب تاريخ نهاية صحيحًا أو اتركه فارغًا.'),
  })
  .refine((v) => !v.endsAt || v.endsAt > v.startsAt, { path: ['endsAt'], message: 'تاريخ النهاية يجب أن يأتي بعد البداية.' });

export const CommitteeSchema = z.object({
  id: optionalUuid('اللجنة غير محددة.'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'المعرّف بحروف إنجليزية صغيرة وأرقام وشرطات فقط، مثل legal-affairs.')
    .max(60, 'المعرّف أطول من 60 محرفًا.'),
  nameAr: z.string().trim().min(3, 'اكتب اسم اللجنة (3 محارف على الأقل).').max(100, 'الاسم أطول من 100 محرف.'),
  mandate: optionalText(2000, 'وصف المجال أطول من 2000 محرف.'),
  isActive: checkbox,
  sortOrder: intField('الترتيب رقم صحيح بين 0 و 1000.', 0, 1000),
});

export const CategorySchema = z.object({
  id: optionalUuid('التصنيف غير محدد.'),
  nameAr: z.string().trim().min(2, 'اكتب اسم التصنيف.').max(100, 'الاسم أطول من 100 محرف.'),
  defaultCommitteeId: optionalUuid('اختر لجنة من القائمة أو اتركها فارغة.'),
  isActive: checkbox,
  sortOrder: intField('الترتيب رقم صحيح بين 0 و 1000.', 0, 1000),
});

export const AreaSchema = z.object({
  id: optionalUuid('المنطقة غير محددة.'),
  nameAr: z.string().trim().min(2, 'اكتب اسم المنطقة.').max(100, 'الاسم أطول من 100 محرف.'),
  parentId: optionalUuid('اختر منطقة أم من القائمة أو اتركها فارغة.'),
});
