import { Prisma } from '@/lib/generated/prisma/client';

// M-5 (docs/code-and-security-audit.md): لا يُسجَّل كائن خطأ كامل. رسائل Prisma قد تقتبس معاملات الاستعلام
// (أسماء، أرقام جوّال، نصوص شكاوى)، فتُسجَّل فئتها ورمزها فقط؛ وغيرها سطر واحد مقصوص بعد إخفاء البريد والأرقام الطويلة.

const MAX_MESSAGE = 200;

/** يخفي البريد وسلاسل الأرقام الطويلة (جوّال، هوية) من نص حر */
export function redact(text: string): string {
  return text
    .replace(/[^\s@<>()"']+@[^\s@<>()"']+\.[^\s@<>()"']+/g, '[email]')
    .replace(/\+?\d[\d\s-]{6,}\d/g, '[number]');
}

export type ErrorSummary = { name: string; code?: string; model?: string; message?: string };

export function safeErrorSummary(e: unknown): ErrorSummary {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    const model = typeof e.meta?.modelName === 'string' ? e.meta.modelName : undefined;
    return { name: e.name, code: e.code, model };
  }
  if (
    e instanceof Prisma.PrismaClientValidationError ||
    e instanceof Prisma.PrismaClientUnknownRequestError ||
    e instanceof Prisma.PrismaClientRustPanicError ||
    e instanceof Prisma.PrismaClientInitializationError
  ) {
    return { name: e.name };
  }
  if (e instanceof Error) {
    const firstLine = e.message.split('\n')[0] ?? '';
    return { name: e.name, message: redact(firstLine).slice(0, MAX_MESSAGE) };
  }
  return { name: typeof e };
}

/** سطر خطأ على الخادم بلا بيانات شخصية */
export function logError(scope: string, e: unknown): void {
  console.error(`[${scope}]`, JSON.stringify(safeErrorSummary(e)));
}
