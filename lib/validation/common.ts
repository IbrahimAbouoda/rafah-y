import { z } from 'zod';

// مكوّنات مخططات مشتركة. تُستخدم على الخادم دائمًا، وفي العميل للتجربة فقط (PRD §6.3).

/** نص اختياري: السلسلة الفارغة من النموذج = غير موجود */
export const optionalText = (max: number, tooLong: string) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().max(max, tooLong).optional());

export const optionalUuid = (message: string) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), z.uuid(message).optional());

export const checkbox = z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean());

export const optionalDate = (message: string) =>
  z.preprocess((v) => (v === '' || v === undefined ? undefined : v), z.coerce.date({ error: message }).optional());

export const requiredDate = (message: string) =>
  z.preprocess((v) => (v === '' ? undefined : v), z.coerce.date({ error: message }));

export const intField = (message: string, min = 0, max = 10_000) =>
  z.preprocess((v) => (v === '' || v === undefined ? 0 : v), z.coerce.number({ error: message }).int(message).min(min, message).max(max, message));
