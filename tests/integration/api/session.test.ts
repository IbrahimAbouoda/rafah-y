import { describe, expect, it } from 'vitest';
import { GET as config } from '@/app/api/mobile/v1/config/route';
import { GET as session } from '@/app/api/mobile/v1/me/session/route';
import { call } from '../../support/api';
import { actAs, createUser } from '../../support/factories';

type Session = {
  grants: Record<string, { all: boolean; own: boolean; committees: string[] }>;
  nav: { admin: { items: { href: string }[] }[]; me: { items: { href: string }[] }[] };
  landingPath: string;
};

describe('GET /config', () => {
  it('عام بلا رمز ويعيد الجداول المرجعية', async () => {
    const res = await call<{ appNameAr: string; currencies: string[]; committees: unknown[] }>(config, { auth: false });
    expect(res.status).toBe(200);
    expect(res.data.appNameAr).toBeTruthy();
    expect(res.data.currencies).toEqual(['ILS', 'USD']);
    expect(res.data.committees.length).toBe(10); // D43: اللجنة العاشرة
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('GET /me/session', () => {
  it('401 بلا رمز وبرسالة عربية', async () => {
    await actAs(null);
    const res = await call(session, { auth: false });
    expect(res.status).toBe(401);
    expect(res.error?.code).toBe('UNAUTHENTICATED');
    expect(res.error?.message_ar).toMatch(/سجّل الدخول/);
  });

  it('401 برمز لا يقابله مستخدم', async () => {
    await actAs(null);
    expect((await call(session)).status).toBe(401);
  });

  it('الشاب: بوابة الشباب فقط، ومنح «خاص»', async () => {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    const res = await call<Session>(session);
    expect(res.status).toBe(200);
    expect(res.data.landingPath).toBe('/me');
    expect(res.data.nav.admin).toEqual([]);
    expect(res.data.grants['complaints:create']).toEqual({ all: false, own: true, committees: [] });
  });

  it('رئيس لجنة: لوحة المجلس ومنح بنطاق لجنته', async () => {
    const head = await createUser([{ key: 'committee_head', committee: 'legal-affairs' }]);
    await actAs(head.id);
    const res = await call<Session>(session);
    expect(res.data.landingPath).toBe('/admin');
    expect(res.data.nav.admin[0]!.items[0]!.href).toBe('/admin');
    expect(res.data.grants['complaints:update_status']!.committees).toHaveLength(1);
  });
});
