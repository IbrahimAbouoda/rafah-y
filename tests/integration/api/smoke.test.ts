import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { call, mobileRoutes } from '../../support/api';
import { actAs, createUser } from '../../support/factories';

// كل مسار GET في واجهة الجوّال يجيب 200 لمستخدم يملك صلاحيته — يلتقط مسارًا مكسورًا لم يغطّه اختبار مجاله،
// ويسجّل أمثلة الاستجابة (npm run api:fixtures) لما لا يصله غيره.

type Handler = Parameters<typeof call>[0];

describe('كل مسارات GET', () => {
  it('200 لصاحب الصلاحية، و 401 بلا رمز لكل مسار غير عام', async () => {
    const admin = await createUser([
      'super_admin',
      'council_president',
      'treasurer',
      'partner',
      'youth',
      { key: 'committee_head', committee: 'legal-affairs' },
    ]);
    const org = await db.organization.create({ data: { name: `مؤسسة فحص ${Date.now()}`, type: 'LOCAL_NGO' } });
    const params: Record<string, Record<string, string>> = {
      '/public/committees/{slug}': { slug: 'legal-affairs' },
      '/admin/committees/{slug}': { slug: 'legal-affairs' },
      '/admin/committees/{slug}/tasks': { slug: 'legal-affairs' },
      '/admin/organizations/{id}': { id: org.id },
      '/admin/settings/users/{id}': { id: admin.id },
    };

    const failures: string[] = [];
    let checked = 0;
    for (const { path: route, module } of await mobileRoutes()) {
      const get = module.GET as Handler | undefined;
      if (!get) continue;
      // مسارات بمعرّف سجل تُغطّى في اختبارات مجالها
      if (route.includes('{') && !params[route]) continue;
      checked += 1;

      await actAs(admin.id);
      const ok = await call(get, { params: params[route] });
      if (ok.status !== 200) failures.push(`${route} → ${ok.status} ${ok.error?.message_ar ?? ''}`);

      if (!route.startsWith('/public') && route !== '/config') {
        await actAs(null);
        const anon = await call(get, { auth: false, params: params[route] });
        if (anon.status !== 401) failures.push(`${route} بلا رمز → ${anon.status}`);
      }
    }
    expect(failures).toEqual([]);
    expect(checked).toBeGreaterThan(30);
  });
});
