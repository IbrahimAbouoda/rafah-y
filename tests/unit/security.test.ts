import { describe, expect, it } from 'vitest';
import { Prisma } from '@/lib/generated/prisma/client';
import { redact, safeErrorSummary } from '@/lib/log';
import { chooseStore } from '@/lib/rate-limit';
import { ipConfig, resolveClientIp, UNKNOWN_IP } from '@/lib/request';

// docs/code-and-security-audit.md — H-1 · H-2 · M-5

const headersOf = (h: Record<string, string>) => (name: string) => h[name] ?? null;

describe('H-1 — عنوان العميل لا يتحكم فيه العميل', () => {
  it('وكيل موثوق واحد: القيمة التي أضافها (الأخيرة)، لا ما كتبه العميل في أولها', () => {
    const cfg = ipConfig({});
    expect(cfg.trustedHops).toBe(1);
    // العميل أرسل 1.2.3.4 مزيّفًا، والوكيل أضاف عنوانه الحقيقي
    expect(resolveClientIp(headersOf({ 'x-forwarded-for': '1.2.3.4, 198.51.100.7' }), cfg)).toBe('198.51.100.7');
  });

  it('تدوير القيمة المزيّفة لا يغيّر الدلو', () => {
    const cfg = ipConfig({});
    const a = resolveClientIp(headersOf({ 'x-forwarded-for': '10.0.0.1, 203.0.113.5' }), cfg);
    const b = resolveClientIp(headersOf({ 'x-forwarded-for': '10.0.0.2, 203.0.113.5' }), cfg);
    expect(a).toBe(b);
  });

  it('وكيلان موثوقان (TRUSTED_PROXY_HOPS=2): الثانية من اليمين', () => {
    const cfg = ipConfig({ TRUSTED_PROXY_HOPS: '2' });
    expect(resolveClientIp(headersOf({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9, 10.1.1.1' }), cfg)).toBe('203.0.113.9');
    // سلسلة أقصر من المتوقع ⇒ الدلو المشترك لا عنوان يختاره العميل
    expect(resolveClientIp(headersOf({ 'x-forwarded-for': '6.6.6.6' }), cfg)).toBe(UNKNOWN_IP);
  });

  it('IP_HEADER: رأس المنصة وحده، و X-Forwarded-For يُتجاهل', () => {
    const cfg = ipConfig({ IP_HEADER: 'X-Real-IP' });
    expect(resolveClientIp(headersOf({ 'x-real-ip': '203.0.113.20', 'x-forwarded-for': '9.9.9.9' }), cfg)).toBe('203.0.113.20');
    expect(resolveClientIp(headersOf({ 'x-forwarded-for': '9.9.9.9' }), cfg)).toBe(UNKNOWN_IP);
  });

  it('قيمة ليست عنوانًا صالحًا ⇒ الدلو المشترك، لا مفتاح جديد لكل قيمة', () => {
    const cfg = ipConfig({});
    expect(resolveClientIp(headersOf({ 'x-forwarded-for': 'not-an-ip' }), cfg)).toBe(UNKNOWN_IP);
    expect(resolveClientIp(headersOf({}), cfg)).toBe(UNKNOWN_IP);
    expect(resolveClientIp(headersOf({ 'x-forwarded-for': '2001:db8::1' }), cfg)).toBe('2001:db8::1');
    expect(ipConfig({ TRUSTED_PROXY_HOPS: '0' }).trustedHops).toBe(1);
  });
});

describe('H-2 — لا رجوع صامت إلى ذاكرة العملية في الإنتاج', () => {
  it('Upstash حين يُضبط، في أي بيئة', () => {
    expect(chooseStore({ NODE_ENV: 'production', UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 't' })).toMatchObject({
      kind: 'upstash',
    });
  });

  it('الإنتاج بلا Upstash يفشل مغلقًا، إلا بإذن صريح لبناء محلي', () => {
    expect(() => chooseStore({ NODE_ENV: 'production' })).toThrow(/UPSTASH_REDIS_REST_URL/);
    expect(() => chooseStore({ NODE_ENV: 'production', UPSTASH_REDIS_REST_URL: 'https://x' })).toThrow();
    expect(chooseStore({ NODE_ENV: 'production', RATE_LIMIT_STORE: 'memory' })).toEqual({ kind: 'memory' });
  });

  it('التطوير والاختبار: ذاكرة العملية', () => {
    expect(chooseStore({ NODE_ENV: 'development' })).toEqual({ kind: 'memory' });
    expect(chooseStore({ NODE_ENV: 'test' })).toEqual({ kind: 'memory' });
  });
});

describe('M-5 — سجلات الأخطاء بلا بيانات شخصية', () => {
  it('خطأ Prisma: الفئة والرمز والنموذج فقط، لا الرسالة التي قد تقتبس القيم', () => {
    const e = new Prisma.PrismaClientKnownRequestError('Unique constraint failed: phone +970599123456, a@b.ps', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { modelName: 'User' },
    });
    const s = safeErrorSummary(e);
    expect(s).toEqual({ name: 'PrismaClientKnownRequestError', code: 'P2002', model: 'User' });
    expect(JSON.stringify(s)).not.toMatch(/970599|a@b/);
  });

  it('خطأ عام: سطر واحد مقصوص، والبريد والأرقام الطويلة مخفية', () => {
    const s = safeErrorSummary(new Error('SMTP rejected user.name@example.ps (+970 599 123 456)\nstack details'));
    expect(s.message).toBe('SMTP rejected [email] ([number])');
    expect(safeErrorSummary(new Error('x'.repeat(500))).message).toHaveLength(200);
    expect(safeErrorSummary('boom')).toEqual({ name: 'string' });
  });

  it('redact لا يمسّ الأرقام القصيرة (رموز الحالة، السنوات)', () => {
    expect(redact('HTTP 503 in 2026')).toBe('HTTP 503 in 2026');
  });
});
