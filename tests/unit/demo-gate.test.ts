import { describe, expect, it, vi } from 'vitest';
import { checkDemoGate, DEMO_COUNT_SQL, DEMO_TABLES } from '@/scripts/check-demo-gate.js';

// Sprint 6 — CI: بناء الإنتاج يفشل عند وجود بيانات عرض (AC-20 · M10). عدّ القاعدة الفعلي في tests/integration/purgeDemoData.test.ts.

const clean = async () => DEMO_TABLES.map((table) => ({ table, count: 0 }));
const prod = { APP_ENV: 'production', DATABASE_URL: 'postgres://prod' };

describe('checkDemoGate', () => {
  it('خارج الإنتاج لا يفحص شيئًا ولا يتصل بالقاعدة (بناء E2E بـ APP_ENV=staging يمرّ)', async () => {
    const count = vi.fn(clean);
    for (const env of [{}, { APP_ENV: 'staging', IS_DEMO: 'true' }]) {
      expect(await checkDemoGate(env, count)).toMatchObject({ ok: true });
    }
    expect(count).not.toHaveBeenCalled();
  });

  it('في الإنتاج: علم العرض يُفشل البناء قبل أي اتصال', async () => {
    const count = vi.fn(clean);
    for (const flag of ['IS_DEMO', 'NEXT_PUBLIC_IS_DEMO']) {
      const res = await checkDemoGate({ ...prod, [flag]: 'true' }, count);
      expect(res).toMatchObject({ ok: false, message: expect.stringContaining(flag) });
    }
    expect(await checkDemoGate({ VERCEL_ENV: 'production', IS_DEMO: 'true' }, count)).toMatchObject({ ok: false });
    expect(count).not.toHaveBeenCalled();
  });

  it('في الإنتاج: سجلات isDemo تُفشل البناء وتُسمّى جداولها، والقاعدة الخالية تمرّ', async () => {
    const dirty = async () => [...(await clean()), { table: 'ideas', count: 3 }];
    expect(await checkDemoGate(prod, dirty)).toMatchObject({ ok: false, message: expect.stringContaining('ideas: 3') });
    expect(await checkDemoGate({ ...prod, IS_DEMO: 'false' }, clean)).toMatchObject({ ok: true });
  });

  it('في الإنتاج: البوابة تُغلق عند الشك — بلا رابط قاعدة أو بتعذّر الاتصال', async () => {
    expect(await checkDemoGate({ APP_ENV: 'production' }, clean)).toMatchObject({ ok: false, message: expect.stringMatching(/DATABASE_URL/) });
    const down = async () => {
      throw new Error('ECONNREFUSED');
    };
    expect(await checkDemoGate(prod, down)).toMatchObject({ ok: false, message: expect.stringContaining('ECONNREFUSED') });
  });

  it('الاستعلام يغطي النماذج الستة', () => {
    for (const t of ['complaints', 'ideas', 'initiatives', 'organizations', 'opportunities', 'activities']) {
      expect(DEMO_COUNT_SQL).toContain(`FROM "${t}" WHERE "isDemo" = true`);
    }
  });
});
