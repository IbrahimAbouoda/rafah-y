import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as login } from '@/app/api/mobile/v1/auth/login/route';
import { POST as register } from '@/app/api/mobile/v1/auth/register/route';
import { POST as resetRequest } from '@/app/api/mobile/v1/auth/reset-request/route';
import { db } from '@/lib/db';
import { call } from '../../support/api';
import { freshIp } from '../../support/factories';

// واجهة الجوّال — المصادقة عبر الخادم (D46): حد المعدل والحظر المتضاعف وقواعد كلمة المرور هنا لا في التطبيق.
// Supabase Auth نفسه بديل وهمي: الاختبار يفحص ما يفعله خادمنا حوله.

const fake = vi.hoisted(() => ({
  users: new Map<string, { id: string; password: string; email: string }>(),
  resets: [] as string[],
}));

const session = (id: string) => ({
  access_token: `access-${id}`,
  refresh_token: `refresh-${id}`,
  expires_at: 2_000_000_000,
  token_type: 'bearer',
  user: { id },
});

vi.mock('@/lib/api/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/auth')>();
  const { currentTestUser } = await import('../../support/identity');
  const authUser = (u: { id: string; email: string }, fullName?: string) => ({
    id: u.id,
    email: u.email,
    phone: '',
    user_metadata: { full_name: fullName },
    identities: [{}],
  });
  return {
    ...actual,
    userFromRequest: vi.fn(async (req: Request) => (actual.bearerToken(req) ? currentTestUser() : null)),
    statelessSupabase: () => ({
      auth: {
        signUp: async ({ email, password, options }: { email: string; password: string; options: { data: { full_name: string } } }) => {
          if (fake.users.has(email)) return { data: { user: { identities: [] }, session: null }, error: null };
          const u = { id: randomUUID(), email, password };
          fake.users.set(email, u);
          return { data: { user: authUser(u, options.data.full_name), session: session(u.id) }, error: null };
        },
        signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
          const u = fake.users.get(email);
          if (!u || u.password !== password) return { data: { user: null, session: null }, error: { code: 'invalid_credentials' } };
          return { data: { user: authUser(u), session: session(u.id) }, error: null };
        },
        resetPasswordForEmail: async (email: string) => {
          fake.resets.push(email);
          return { data: {}, error: null };
        },
      },
    }),
  };
});

const email = () => `mobile-${randomUUID().slice(0, 8)}@example.test`;
const password = 'Rafah2026pulse';

beforeEach(() => {
  freshIp();
});

describe('POST /auth/register', () => {
  it('201 بجلسة للتطبيق، ويُنشأ User بدور الشاب', async () => {
    const e = email();
    const res = await call<{ session: { accessToken: string; refreshToken: string } }>(register, {
      auth: false,
      body: { fullName: 'شاب تجريبي', channel: 'email', email: e, password, confirm: password },
    });
    expect(res.status).toBe(201);
    expect(res.data.session.refreshToken).toMatch(/^refresh-/);
    const user = await db.user.findFirstOrThrow({ where: { email: e }, include: { roleAssignments: { include: { role: true } } } });
    expect(user.roleAssignments.map((a) => a.role.key)).toEqual(['youth']);
  });

  it('كلمة مرور شائعة أو قصيرة ← 422 برسالة الحقل، قبل أي نداء لـ Supabase', async () => {
    const e = email();
    const res = await call(register, {
      auth: false,
      body: { fullName: 'شاب تجريبي', channel: 'email', email: e, password: 'short1', confirm: 'short1' },
    });
    expect(res.status).toBe(422);
    expect(res.error?.field_errors?.password?.[0]).toMatch(/10 محارف/);
    expect(fake.users.has(e)).toBe(false);
  });

  it('الحساب الموجود ← 422 يوجّه للدخول', async () => {
    const e = email();
    const body = { fullName: 'شاب تجريبي', channel: 'email', email: e, password, confirm: password };
    await call(register, { auth: false, body });
    const res = await call(register, { auth: false, body });
    expect(res.status).toBe(422);
    expect(res.error?.message_ar).toMatch(/مسجّل مسبقًا/);
  });
});

describe('POST /auth/login — §6.4', () => {
  it('الدخول يعيد الجلسة ومسار الهبوط', async () => {
    const e = email();
    await call(register, { auth: false, body: { fullName: 'شاب تجريبي', channel: 'email', email: e, password, confirm: password } });
    const res = await call<{ session: { accessToken: string }; landingPath: string }>(login, {
      auth: false,
      body: { identifier: e, password },
    });
    expect(res.status).toBe(200);
    expect(res.data.landingPath).toBe('/me');
  });

  it('بعد 5 إخفاقات: حظر 429 حتى بكلمة المرور الصحيحة، برسالة لا تكشف وجود الحساب', async () => {
    const e = email();
    await call(register, { auth: false, body: { fullName: 'شاب تجريبي', channel: 'email', email: e, password, confirm: password } });
    for (let i = 0; i < 5; i++) {
      const bad = await call(login, { auth: false, body: { identifier: e, password: 'wrong-password-1' } });
      expect(bad.status).toBe(422);
      expect(bad.error?.message_ar).toMatch(/غير صحيحة/);
    }
    const blocked = await call(login, { auth: false, body: { identifier: e, password } });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

describe('POST /auth/reset-request — D17 · D49', () => {
  it('الرسالة نفسها سواء وُجد البريد أم لا، والحد 5 في الساعة لكل IP', async () => {
    const unknown = await call(resetRequest, { auth: false, body: { email: email() } });
    expect(unknown.status).toBe(200);
    expect(unknown.message).toMatch(/إن كان هذا البريد مسجّلًا/);
    for (let i = 0; i < 4; i++) await call(resetRequest, { auth: false, body: { email: email() } });
    expect((await call(resetRequest, { auth: false, body: { email: email() } })).status).toBe(429);
  });
});
