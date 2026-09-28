'use server';

import { revalidatePath } from 'next/cache';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { requirePermission, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { FaqActiveSchema, FaqSchema } from '@/lib/validation/support';

// قاعدة الأسئلة المعتمدة — faq:manage (PRD §13.5). كل إنشاء وتعديل وتعطيل بسطر تدقيق (AC-18 ⑥).
// التعطيل يُخفي السؤال عن البوت و /help فورًا (AC-18 ⑤): البوت لا يقرأ إلا isActive = true.

function revalidateFaq() {
  revalidatePath('/admin/settings/faq');
  revalidatePath('/admin/support');
  revalidatePath('/help');
}

/** faq/create · faq/update — faqId غائب = إنشاء */
export async function saveFaqAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'faq:manage');
    const data = FaqSchema.parse(formToObject(form));
    requirePermission(user, 'faq:manage', { committeeId: null });
    const category = await db.faqCategory.findUnique({ where: { id: data.categoryId }, select: { id: true } });
    if (!category) throw notFound('التصنيف');
    const fields = { categoryId: data.categoryId, question: data.question, answerMd: data.answer, keywords: data.keywords };

    if (!data.faqId) {
      await db.$transaction(async (tx) => {
        const faq = await tx.faqEntry.create({ data: { ...fields, createdById: user.id, updatedById: user.id } });
        await writeAudit(tx, user, 'faq.create', 'FaqEntry', faq.id, null, fields);
      });
      revalidateFaq();
      return 'أُضيف السؤال، ويجده البوت من الآن.';
    }

    const before = await db.faqEntry.findUnique({
      where: { id: data.faqId },
      select: { id: true, categoryId: true, question: true, answerMd: true, keywords: true },
    });
    if (!before) throw notFound('السؤال');
    await db.$transaction(async (tx) => {
      await tx.faqEntry.update({ where: { id: before.id }, data: { ...fields, updatedById: user.id } });
      await writeAudit(tx, user, 'faq.update', 'FaqEntry', before.id, before, fields);
    });
    revalidateFaq();
    return 'حُفظ التعديل.';
  });
}

/** faq/disable — ويعيد التفعيل بسطر faq.update */
export async function setFaqActiveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'faq:manage');
    const { faqId, active } = FaqActiveSchema.parse(formToObject(form));
    const faq = await db.faqEntry.findUnique({ where: { id: faqId }, select: { id: true, isActive: true } });
    if (!faq) throw notFound('السؤال');
    requirePermission(user, 'faq:manage', { committeeId: null });
    if (faq.isActive === active) return active ? 'السؤال مفعّل أصلًا.' : 'السؤال معطّل أصلًا.';
    await db.$transaction(async (tx) => {
      await tx.faqEntry.update({ where: { id: faq.id }, data: { isActive: active, updatedById: user.id } });
      await writeAudit(tx, user, active ? 'faq.update' : 'faq.disable', 'FaqEntry', faq.id, { isActive: faq.isActive }, { isActive: active });
    });
    revalidateFaq();
    return active ? 'فُعّل السؤال ويجده البوت من الآن.' : 'عُطّل السؤال ولن يظهر في البوت ولا في صفحة المساعدة.';
  });
}
