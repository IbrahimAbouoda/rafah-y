import { z } from 'zod';

// PRD §6.1: كلمة مرور 10 محارف على الأقل، مع رفض الكلمات الشائعة.
// «حروف وأرقام» يطابق password_requirements في supabase/config.toml.
const COMMON_PASSWORDS = new Set([
  '1234567890',
  '12345678910',
  '0123456789',
  '0987654321',
  '1111111111',
  '0000000000',
  'password12',
  'password123',
  'password1234',
  'qwerty1234',
  'qwertyuiop',
  'qwerty123456',
  'asdfghjkl1',
  'abcdefg123',
  'abc1234567',
  'abcd123456',
  'iloveyou12',
  'palestine1',
  'palestine123',
  'gaza123456',
  'rafah12345',
  'rafah123456',
  'admin12345',
  'welcome123',
  'letmein123',
  'football12',
  'aa12345678',
  'a123456789',
  '1q2w3e4r5t',
  'zaq12wsxcde',
]);

export const passwordSchema = z
  .string()
  .min(10, 'كلمة المرور قصيرة: اكتب 10 محارف على الأقل.')
  .max(72, 'كلمة المرور طويلة جدًا: 72 محرفًا كحد أقصى.')
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'كلمة المرور يجب أن تحتوي حروفًا إنجليزية وأرقامًا معًا.')
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), 'كلمة المرور هذه شائعة ويسهل تخمينها. اختر غيرها.')
  .refine((p) => !/^(.)\1+$/.test(p), 'لا تستخدم محرفًا واحدًا مكررًا. اختر كلمة مرور أقوى.');

/**
 * يقبل رقم جوّال فلسطيني بصيغة محلية (059… / 056…) أو دولية (+970 / +972 / 00970).
 * افتراض: الأرقام المحلية تُحوَّل إلى +970.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-()]/g, '').replace(/^00/, '+');
  if (/^05\d{8}$/.test(digits)) return `+970${digits.slice(1)}`;
  if (/^\+97[02]5\d{8}$/.test(digits)) return digits;
  return null;
}

const email = z.email('اكتب بريدًا إلكترونيًا صحيحًا، مثل name@example.com.').max(254).transform((e) => e.toLowerCase());

const phone = z
  .string()
  .transform((v, ctx) => {
    const normalized = normalizePhone(v);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'اكتب رقم جوّال صحيحًا، مثل 0599123456 أو ‎+970599123456.' });
      return z.NEVER;
    }
    return normalized;
  });

/** بيانات الدخول بالبريد أو بالهاتف — واحد فقط */
export type Credentials = { email: string; phone?: undefined; password: string } | { phone: string; email?: undefined; password: string };

export const RegisterSchema = z
  .object({
    fullName: z.string().trim().min(3, 'اكتب اسمك الكامل (3 محارف على الأقل).').max(100, 'الاسم أطول من 100 محرف.'),
    channel: z.enum(['email', 'phone'], 'اختر التسجيل بالبريد أو بالهاتف.'),
    email: z.string().optional(),
    phone: z.string().optional(),
    password: passwordSchema,
    confirm: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirm) {
      ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'كلمتا المرور غير متطابقتين. أعد كتابة التأكيد.' });
    }
    const field = v.channel === 'email' ? email : phone;
    const r = field.safeParse(v.channel === 'email' ? v.email ?? '' : v.phone ?? '');
    if (!r.success) {
      ctx.addIssue({ code: 'custom', path: [v.channel], message: r.error.issues[0]?.message ?? '' });
    }
  })
  .transform((v): Credentials & { fullName: string } =>
    v.channel === 'email'
      ? { fullName: v.fullName, password: v.password, email: email.parse(v.email) }
      : { fullName: v.fullName, password: v.password, phone: phone.parse(v.phone) },
  );

export const LoginSchema = z
  .object({
    identifier: z.string().trim().min(1, 'اكتب بريدك أو رقم جوّالك.'),
    password: z.string().min(1, 'اكتب كلمة المرور.'),
  })
  .transform((v, ctx): Credentials => {
    if (v.identifier.includes('@')) {
      const r = email.safeParse(v.identifier);
      if (r.success) return { email: r.data, password: v.password };
    } else {
      const p = normalizePhone(v.identifier);
      if (p) return { phone: p, password: v.password };
    }
    ctx.addIssue({ code: 'custom', path: ['identifier'], message: 'اكتب بريدًا صحيحًا أو رقم جوّال صحيحًا.' });
    return z.NEVER;
  });

export const ResetRequestSchema = z.object({ email });

export const NewPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'كلمتا المرور غير متطابقتين. أعد كتابة التأكيد.' });
