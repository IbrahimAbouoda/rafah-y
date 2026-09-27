import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';

// C-1 (docs/code-and-security-audit.md): لا يُفتح أي جدول لواجهة Supabase Data API.
// قاعدة الاختبار تبدأ بأدوار Supabase ومنحها الافتراضية (tests/support/global-setup.ts)، ثم الـ migrations —
// فيفشل هذا الاختبار إن حُذف migration الإغلاق، أو أُضيف جدول بلا RLS، أو أُعيدت منحة لـ anon.

type Row = { name: string; rls: boolean; s: boolean; i: boolean; u: boolean; d: boolean };

async function tablePrivileges(role: 'anon' | 'authenticated'): Promise<Row[]> {
  return db.$queryRawUnsafe<Row[]>(
    `SELECT c.relname AS name, c.relrowsecurity AS rls,
            has_table_privilege($1, c.oid, 'SELECT') AS s, has_table_privilege($1, c.oid, 'INSERT') AS i,
            has_table_privilege($1, c.oid, 'UPDATE') AS u, has_table_privilege($1, c.oid, 'DELETE') AS d
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY 1`,
    role,
  );
}

describe('إغلاق Data API — C-1', () => {
  it('كل جداول public عليها RLS', async () => {
    const rows = await tablePrivileges('anon');
    expect(rows.length).toBeGreaterThan(50);
    expect(rows.filter((r) => !r.rls).map((r) => r.name)).toEqual([]);
  });

  it.each(['anon', 'authenticated'] as const)('%s بلا أي صلاحية على أي جدول', async (role) => {
    const open = (await tablePrivileges(role)).filter((r) => r.s || r.i || r.u || r.d).map((r) => r.name);
    expect(open).toEqual([]);
  });

  it('الدوال (next_ref وغيرها) غير قابلة للتنفيذ من anon', async () => {
    const rows = await db.$queryRawUnsafe<{ name: string }[]>(
      `SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')`,
    );
    expect(rows.map((r) => r.name)).toEqual([]);
  });

  it('التطبيق (مالك الجداول) يقرأ ويكتب كما كان', async () => {
    const before = await db.skill.count();
    const s = await db.skill.create({ data: { nameAr: `مهارة فحص الإغلاق ${Date.now()}` } });
    expect(await db.skill.count()).toBe(before + 1);
    await db.skill.delete({ where: { id: s.id } });
    const [ref] = await db.$queryRaw<{ ref: string }[]>`SELECT next_ref('LOCK-TEST') AS ref`;
    expect(ref?.ref).toMatch(/^RF-LOCK-TEST-0+1$/);
  });
});
