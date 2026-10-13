import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';

// D32 — Data API مغلق: دورا anon و authenticated (مفتاح Supabase العلني) لا يصلان أي جدول ولا دالة في public.
// global-setup يمنحهما ما يمنحه Supabase افتراضيًا قبل الـ migrations، فالاختبار يثبت السحب لا الغياب.

async function as<T>(role: 'anon' | 'authenticated', sql: string): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
    return tx.$queryRawUnsafe<T>(sql);
  });
}

describe('إغلاق Data API — D32', () => {
  for (const role of ['anon', 'authenticated'] as const) {
    it(`${role}: لا قراءة للجداول الحساسة`, async () => {
      for (const table of ['users', 'complaints', 'complaint_contacts', 'audit_logs', 'funding_records', 'role_assignments']) {
        await expect(as(role, `SELECT 1 FROM "${table}" LIMIT 1`)).rejects.toThrow(/permission denied/);
      }
    });

    it(`${role}: لا كتابة ولا توليد رقم مرجعي`, async () => {
      await expect(as(role, `INSERT INTO "areas" ("id", "nameAr", "updatedAt") VALUES (gen_random_uuid(), 'منطقة دخيلة', now())`)).rejects.toThrow(
        /permission denied/,
      );
      await expect(as(role, `SELECT next_ref('CMP-2026')`)).rejects.toThrow(/permission denied/);
    });
  }

  it('الجداول الجديدة بعد الإغلاق لا تُكشف تلقائيًا', async () => {
    await db.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "lockdown_probe" ("id" int)');
    try {
      await expect(as('anon', 'SELECT 1 FROM "lockdown_probe"')).rejects.toThrow(/permission denied/);
    } finally {
      await db.$executeRawUnsafe('DROP TABLE "lockdown_probe"');
    }
  });

  it('RLS مفعّل على كل جدول، والمالك (اتصال التطبيق) يعمل كالمعتاد', async () => {
    const off = await db.$queryRawUnsafe<{ tablename: string }[]>(
      `SELECT c.relname AS tablename FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`,
    );
    expect(off).toEqual([]);
    expect(await db.committee.count()).toBeGreaterThan(0);
  });
});
