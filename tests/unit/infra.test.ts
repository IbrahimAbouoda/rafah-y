import fg from 'fast-glob';
import { describe, expect, it } from 'vitest';
import { pgConnection } from '@/lib/pg-ssl.js';

// C8 · §11.2: لا مسار API بلا قرار موثّق — هكذا دخل /api/chat مفتوحًا بلا هوية ولا حد معدل (أُزيل 2026-10-02)
const DOCUMENTED_ROUTES = [
  'app/(auth)/reset-password/confirm/route.ts',
  'app/api/cron/email-retry/route.ts',
  'app/api/cron/task-reminders/route.ts',
];

describe('مسارات API', () => {
  it('كل Route Handler موثّق — مسار جديد يحتاج قرارًا في PRD قبل إضافته هنا', async () => {
    const found = await fg('app/**/route.{ts,tsx,js}', { ignore: ['node_modules/**'] });
    expect(found.sort()).toEqual([...DOCUMENTED_ROUTES].sort());
  });
});

describe('pgConnection — TLS بالتحقق من الشهادة', () => {
  const url = 'postgresql://u:p%40ss@pooler.example.com:6543/postgres?pgbouncer=true&sslmode=require&uselibpqcompat=true';

  it('بلا DATABASE_CA_CERT يبقى الرابط كما هو (محليًا)', () => {
    expect(pgConnection(url, {})).toEqual({ connectionString: url });
  });

  it('مع الشهادة: تحقق كامل، وتُحذف معاملات ssl التي كانت ستُلغيه، ويبقى الباقي', () => {
    const res = pgConnection(url, { DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\\nAAA\\n-----END CERTIFICATE-----' });
    expect(res.ssl).toEqual({ ca: '-----BEGIN CERTIFICATE-----\nAAA\n-----END CERTIFICATE-----', rejectUnauthorized: true });
    const out = new URL(res.connectionString);
    expect(out.searchParams.has('sslmode')).toBe(false);
    expect(out.searchParams.has('uselibpqcompat')).toBe(false);
    expect(out.searchParams.get('pgbouncer')).toBe('true');
    expect(out.password).toBe('p%40ss');
    expect(out.port).toBe('6543');
  });
});
