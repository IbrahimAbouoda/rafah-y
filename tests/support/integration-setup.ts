import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { afterAll, afterEach, inject, vi } from 'vitest';
import { createDbFromClient, setDbForTests } from '@/lib/db';
import { PrismaClient } from '@/lib/generated/prisma/client';

process.env.CONTACT_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString('base64');

// التطبيق يتصل عبر @prisma/adapter-pg؛ الاختبار عبر محوّل PGlite داخل العملية — نفس المخطط والقيود والبذرة.
const pg = new PGlite(inject('pgliteDir'));
const client = new PrismaClient({ adapter: new PrismaPGlite(pg) });
setDbForTests(createDbFromClient(client));

afterAll(async () => {
  await client.$disconnect();
  await pg.close();
});

// after() يحتاج سياق طلب Next.js: في الاختبار يُجدول العمل ويُنتظر بعد كل اختبار (flushAfter للانتظار داخله)،
// فلا يبقى استعلام يعمل بعد انتهاء الاختبار أو إغلاق القاعدة
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  const { scheduleAfter } = await import('./identity');
  return { ...actual, after: vi.fn(scheduleAfter) };
});
afterEach(async () => {
  const { flushAfter } = await import('./identity');
  await flushAfter();
});

// revalidatePath يحتاج سياق طلب Next.js؛ لا أثر له في الاختبار
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

// الهوية تأتي من Supabase في التطبيق؛ في الاختبار تُضبط بـ actAs()
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  const { currentTestUser } = await import('./identity');
  return {
    ...actual,
    getCurrentUser: vi.fn(async () => currentTestUser()),
    requireUser: vi.fn(async () => {
      const user = currentTestUser();
      if (!user) throw (await import('@/lib/errors')).unauthenticated();
      return user;
    }),
  };
});

// clientIp() يقرأ رؤوس طلب Next.js؛ في الاختبار يُضبط بـ setTestIp()
vi.mock('@/lib/request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/request')>();
  const { currentTestIp } = await import('./identity');
  return { ...actual, clientIp: vi.fn(async () => currentTestIp()) };
});
