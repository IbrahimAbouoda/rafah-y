import { Prisma } from '@/lib/generated/prisma/client';

/**
 * سجل آخر يمنع الحذف: RESTRICT (23001) أو مفتاح أجنبي (23503)، أو سطر تدقيق يمنع إفراغَ منفّذه
 * (audit_logs_append_only · 42501). Prisma يغلّف رمز Postgres برموز تختلف حسب المحوّل، فالعبرة بالرمز الأصلي.
 */
const REFERENCED_CODES = new Set(['23001', '23503', '42501']);

export function isReferencedError(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const meta = e.meta as { driverAdapterError?: { cause?: { originalCode?: string } } } | undefined;
  const code = meta?.driverAdapterError?.cause?.originalCode;
  return code ? REFERENCED_CODES.has(code) : /Code: `(23001|23503|42501)`/.test(e.message);
}
