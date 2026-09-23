import { describe, expect, it } from 'vitest';
import { LoginSchema, NewPasswordSchema, normalizePhone, passwordSchema, RegisterSchema } from '@/lib/validation/auth';
import { AreaSchema, AssignRoleSchema, CommitteeSchema, StartTermSchema } from '@/lib/validation/settings';

const firstError = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message;

describe('كلمة المرور — PRD §6.1', () => {
  it('تقبل 10 محارف تجمع حروفًا وأرقامًا', () => {
    expect(passwordSchema.safeParse('Sunrise2026x').success).toBe(true);
  });
  it('ترفض الأقصر من 10 برسالة عربية', () => {
    expect(firstError(passwordSchema.safeParse('abc12345'))).toContain('10 محارف');
  });
  it('ترفض الكلمات الشائعة', () => {
    expect(firstError(passwordSchema.safeParse('password123'))).toContain('شائعة');
    expect(firstError(passwordSchema.safeParse('Palestine123'))).toContain('شائعة');
  });
  it('ترفض الأرقام وحدها أو الحروف وحدها', () => {
    expect(passwordSchema.safeParse('9876543210123').success).toBe(false);
    expect(passwordSchema.safeParse('onlyletterspass').success).toBe(false);
  });
});

describe('رقم الجوّال', () => {
  it('يحوّل الصيغة المحلية إلى +970', () => {
    expect(normalizePhone('0599123456')).toBe('+970599123456');
    expect(normalizePhone('059 912 3456')).toBe('+970599123456');
  });
  it('يقبل الصيغ الدولية', () => {
    expect(normalizePhone('+970569123456')).toBe('+970569123456');
    expect(normalizePhone('00972599123456')).toBe('+972599123456');
  });
  it('يرفض أرقامًا غير صالحة', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('0799123456')).toBeNull();
  });
});

describe('التسجيل', () => {
  const base = { fullName: 'اسم تجريبي', password: 'Sunrise2026x', confirm: 'Sunrise2026x' };
  it('بالبريد', () => {
    const r = RegisterSchema.parse({ ...base, channel: 'email', email: 'Test@Example.org' });
    expect(r).toMatchObject({ email: 'test@example.org', fullName: 'اسم تجريبي' });
  });
  it('بالهاتف', () => {
    expect(RegisterSchema.parse({ ...base, channel: 'phone', phone: '0599123456' })).toMatchObject({ phone: '+970599123456' });
  });
  it('يرفض تأكيدًا غير مطابق على حقل التأكيد', () => {
    const r = RegisterSchema.safeParse({ ...base, confirm: 'Different2026', channel: 'email', email: 'a@b.org' });
    expect(r.success).toBe(false);
    expect(r.error?.issues.find((i) => i.path[0] === 'confirm')?.message).toContain('غير متطابقتين');
  });
  it('يرفض بريدًا غير صالح على حقل البريد', () => {
    const r = RegisterSchema.safeParse({ ...base, channel: 'email', email: 'not-an-email' });
    expect(r.error?.issues.find((i) => i.path[0] === 'email')).toBeDefined();
  });
});

describe('الدخول', () => {
  it('يميّز البريد من الهاتف', () => {
    expect(LoginSchema.parse({ identifier: 'a@b.org', password: 'x' })).toEqual({ email: 'a@b.org', password: 'x' });
    expect(LoginSchema.parse({ identifier: '0599123456', password: 'x' })).toEqual({ phone: '+970599123456', password: 'x' });
  });
  it('يرفض معرّفًا غير صالح', () => {
    expect(LoginSchema.safeParse({ identifier: 'foo', password: 'x' }).success).toBe(false);
  });
  it('كلمة مرور جديدة تتطلب تطابق التأكيد', () => {
    expect(NewPasswordSchema.safeParse({ password: 'Sunrise2026x', confirm: 'Sunrise2026y' }).success).toBe(false);
  });
});

describe('مخططات الإعدادات', () => {
  const uuid = '00000000-0000-4000-8000-000000000001';
  it('تعيين دور: الحقول الفارغة الاختيارية = غير موجودة', () => {
    expect(AssignRoleSchema.parse({ userId: uuid, roleId: uuid, committeeId: '', title: '', endsAt: '' })).toEqual({
      userId: uuid,
      roleId: uuid,
    });
  });
  it('الدورة: النهاية بعد البداية', () => {
    expect(StartTermSchema.safeParse({ name: 'دورة', startsAt: '2026-10-01', endsAt: '2026-09-01' }).success).toBe(false);
  });
  it('معرّف اللجنة بحروف إنجليزية صغيرة وشرطات', () => {
    expect(CommitteeSchema.safeParse({ slug: 'Legal Affairs', nameAr: 'اللجنة', sortOrder: '1' }).success).toBe(false);
    expect(CommitteeSchema.parse({ slug: 'legal-affairs', nameAr: 'اللجنة القانونية', isActive: 'on', sortOrder: '' })).toMatchObject({
      slug: 'legal-affairs',
      isActive: true,
      sortOrder: 0,
    });
  });
  it('المنطقة: الأم اختيارية', () => {
    expect(AreaSchema.parse({ nameAr: 'حي', parentId: '' })).toEqual({ nameAr: 'حي' });
  });
});
