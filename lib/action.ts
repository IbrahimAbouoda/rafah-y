import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { Prisma } from '@/lib/generated/prisma/client';
import { AppError } from '@/lib/errors';

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** يتغيّر مع كل نتيجة ليُعاد عرض الرسالة حتى لو تكرر نصّها */
  at?: number;
} | null;

// رسائل قيود قاعدة البيانات (sql/constraints.sql) — تصل فقط إن تجاوز أحدهم طبقة التطبيق
const CONSTRAINT_MESSAGES: Record<string, string> = {
  council_terms_one_current: 'توجد دورة حالية أخرى. أنهِ الدورة الحالية قبل بدء دورة جديدة.',
  tasks_no_self_approval: 'لا يمكنك اعتماد مهمة مسندة إليك. يعتمدها رئيس اللجنة.',
  funding_four_eyes: 'لا يمكنك اعتماد قيد سجّلته بنفسك. يعتمده شخص آخر.',
  complaints_dismissed_needs_reason: 'اكتب سبب الاستبعاد قبل استبعاد الشكوى.',
};

function constraintMessage(e: unknown): string | null {
  const text = e instanceof Error ? e.message : String(e);
  for (const [name, message] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (text.includes(name)) return message;
  }
  return null;
}

export function formToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string') out[k] = v;
  return out;
}

/** يحوّل كل خطأ إلى رسالة عربية قابلة للعرض. لا رسائل تقنية خام للمستخدم (DoD بند 6). */
export async function runAction(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await fn();
    return { ok: true, message: message ?? 'تم الحفظ.', at: Date.now() };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AppError) {
      return { ok: false, message: e.message, fieldErrors: e.fieldErrors, at: Date.now() };
    }
    if (e instanceof z.ZodError) {
      return {
        ok: false,
        message: 'بعض الحقول تحتاج تصحيحًا. راجع الرسائل تحت كل حقل.',
        fieldErrors: z.flattenError(e).fieldErrors as Record<string, string[]>,
        at: Date.now(),
      };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, message: 'هذه القيمة مستخدمة في سجل آخر. اختر قيمة مختلفة.', at: Date.now() };
    }
    const constraint = constraintMessage(e);
    if (constraint) return { ok: false, message: constraint, at: Date.now() };
    console.error('[action]', e);
    return { ok: false, message: 'تعذّر إتمام العملية بسبب خطأ في الخادم. أعد المحاولة بعد قليل.', at: Date.now() };
  }
}
