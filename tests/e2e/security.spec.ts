import { expect, test } from '@playwright/test';
import { config } from 'dotenv';

/**
 * C-1 (docs/code-and-security-audit.md): واجهة Supabase Data API مغلقة أمام المفتاح العام (anon).
 * المكمّل الحي لـ tests/integration/data-api-lockdown.test.ts — PGlite لا يشغّل PostgREST نفسه.
 */
config({ path: '.env.local' });

const TABLES = ['users', 'role_assignments', 'audit_logs', 'opportunity_applications', 'complaint_contacts', 'youth_profiles'];

test('المفتاح العام لا يقرأ ولا يكتب أي جدول، ولا ينفّذ next_ref', async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop', 'فحص واحد لكل تشغيل');
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  for (const table of TABLES) {
    const read = await request.get(`${base}/rest/v1/${table}?select=*&limit=1`, { headers });
    expect(read.status(), `قراءة ${table}`).toBeGreaterThanOrEqual(400);
  }
  const write = await request.post(`${base}/rest/v1/role_assignments`, { headers, data: {} });
  expect(write.status(), 'كتابة role_assignments').toBeGreaterThanOrEqual(400);
  const rpc = await request.post(`${base}/rest/v1/rpc/next_ref`, { headers, data: { p_key: 'E2E-PROBE' } });
  expect(rpc.status(), 'تنفيذ next_ref').toBeGreaterThanOrEqual(400);
});
