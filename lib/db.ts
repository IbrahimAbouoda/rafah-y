import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/lib/generated/prisma/client';
import { pgConnection } from '@/lib/pg-ssl.js';

// النماذج الاثنا عشر ذات الحذف الناعم — PRD §4.1
export const SOFT_DELETE_MODELS = new Set([
  'User',
  'Committee',
  'Organization',
  'FaqEntry',
  'Complaint',
  'Idea',
  'Initiative',
  'Opportunity',
  'Activity',
  'Task',
  'MediaPost',
  'FileObject',
]);

const READ_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

type WhereArgs = { where?: Record<string, unknown> };

/**
 * يستبعد السجلات المحذوفة ناعمًا من كل قراءة. لقراءة المحذوف صراحةً مرّر `deletedAt` في where.
 * الحذف الناعم يُكتب كتحديث لـ deletedAt، ولا يُستدعى delete على هذه النماذج.
 */
function withSoftDelete(client: PrismaClient) {
  return client.$extends({
    name: 'soft-delete',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (SOFT_DELETE_MODELS.has(model) && READ_OPERATIONS.has(operation)) {
            const a = (args ?? {}) as WhereArgs;
            if (!a.where || !('deletedAt' in a.where)) {
              a.where = { ...a.where, deletedAt: null };
            }
            return query(a as typeof args);
          }
          return query(args);
        },
      },
    },
  });
}

export function createDb(url: string) {
  const adapter = new PrismaPg({
    ...pgConnection(url),
    // الاستضافة بلا خادم: نسخ كثيرة تتقاسم pooler واحدًا، فالمجمّع صغير لكل نسخة
    max: Number(process.env.DB_POOL_MAX) || 5,
    // انقطاع القاعدة يفشل سريعًا فتصل رسالة runAction العربية بدل تعليق الطلب حتى مهلة الدالة
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
  });
  return withSoftDelete(new PrismaClient({ adapter }));
}

/** للاختبارات فقط: عميل على محوّل آخر (PGlite) بنفس امتداد الحذف الناعم. */
export function createDbFromClient(client: PrismaClient) {
  return withSoftDelete(client);
}

export type Db = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];

const globalForDb = globalThis as unknown as { db?: Db };

/** للاختبارات فقط: يستبدل العميل العام قبل أول استخدام. */
export function setDbForTests(instance: Db) {
  globalForDb.db = instance;
}

function getDb(): Db {
  if (!globalForDb.db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    globalForDb.db = createDb(url);
  }
  return globalForDb.db;
}

// إنشاء كسول: الاستيراد لا يفتح اتصالًا، فيعمل البناء بلا قاعدة بيانات.
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
