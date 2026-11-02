'use server';

import { revalidatePath } from 'next/cache';
import { formToObject, runAction, runActionData, type ActionState, type DataState } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { getCurrentUser, requirePermission, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { conflict, notFound, rateLimited } from '@/lib/errors';
import { sendEmailsAfterResponse, permissionHolders, queueNotifications } from '@/lib/notify';
import { limit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/request';
import { matchFaq } from '@/lib/support/match';
import { AnswerInquirySchema, AskBotSchema, BotQueryIdSchema, InquiryIdSchema, SendInquirySchema } from '@/lib/validation/support';

// بوت الاستفسارات والرد البشري — PRD §13 · AC-18.
// البوت لا يؤلّف إجابة: إما نص FaqEntry نشط، أو «لم أجد» (§13.1). استخدام البوت مفتوح للزوار (§12 SupportBotWidget)،
// فيحلّ حد المعدل (20/ساعة — §6.4) محلّ فحص الهوية للزائر، ومن سجّل دخوله يحتاج support:ask ليرسل استفسارًا.

export type BotAnswer = { id: string; question: string; answerMd: string };
export type BotResult = { botQueryId: string; answers: BotAnswer[] };

async function throttle(userId: string | undefined) {
  const r = await limit('bot', userId ?? `ip:${await clientIp()}`);
  if (!r.allowed) throw rateLimited(r.retryAfterSec);
}

/** support/ask — مطابقة §13.2. أفضل نتيجة useCount++، والسؤال يُسجَّل BotQuery لقياس M9 (بلا نصه ولا هوية صاحبه). */
export async function askBotAction(_prev: unknown, form: FormData): Promise<DataState<BotResult>> {
  return runActionData(async () => {
    const user = await getCurrentUser();
    await throttle(user?.id);
    const { question } = AskBotSchema.parse(formToObject(form));

    const entries = await db.faqEntry.findMany({
      where: { isActive: true, category: { isActive: true } },
      select: { id: true, question: true, answerMd: true, keywords: true, useCount: true },
    });
    const matches = matchFaq(question, entries);
    const best = matches[0];

    const botQuery = await db.$transaction(async (tx) => {
      if (best) await tx.faqEntry.update({ where: { id: best.id }, data: { useCount: { increment: 1 } } });
      return tx.botQuery.create({
        data: { status: best ? 'ANSWERED' : 'UNRESOLVED_ESCALATED', matchedFaqId: best?.id ?? null },
        select: { id: true },
      });
    });
    return {
      message: best ? 'وجدنا إجابة معتمدة.' : 'لم نجد إجابة معتمدة لسؤالك.',
      data: { botQueryId: botQuery.id, answers: matches.map(({ id, question: q, answerMd }) => ({ id, question: q, answerMd })) },
    };
  });
}

/** «لم تفدني الإجابة» — السؤال يُحسب غير محلول في M9، ويُعرض التحويل للفريق (§13.2) */
export async function markUnhelpfulAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    await throttle(user?.id);
    const { botQueryId } = BotQueryIdSchema.parse(formToObject(form));
    await db.botQuery.updateMany({ where: { id: botQueryId, status: 'ANSWERED' }, data: { status: 'UNRESOLVED_ESCALATED' } });
    return 'شكرًا. يمكنك إرسال سؤالك لفريق المجلس.';
  });
}

/** support/ask (إرسال) — SupportInquiry بحالة NEW، ويُشعَر فريق الدعم داخل المنصة (§8.2 «استفسار بلا إجابة») */
export async function sendInquiryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (user) requirePermission(user, 'support:ask');
    await throttle(user?.id);
    const data = SendInquirySchema.parse(formToObject(form));

    const bot = data.botQueryId
      ? await db.botQuery.findUnique({ where: { id: data.botQueryId }, select: { id: true, status: true, inquiryId: true, matchedFaqId: true } })
      : null;
    if (bot && (bot.inquiryId || bot.status !== 'UNRESOLVED_ESCALATED')) throw conflict('أُرسل هذا السؤال من قبل، أو وجد إجابة. اسأل من جديد إن احتجت.');

    await db.$transaction(async (tx) => {
      const inquiry = await tx.supportInquiry.create({
        data: {
          question: data.question,
          askerId: user?.id ?? null,
          // وسيلة التواصل للزائر فقط — المسجَّل يصله الرد إشعارًا
          contactHint: user ? null : (data.contactHint ?? null),
          matchedFaqId: bot?.matchedFaqId ?? null,
        },
        select: { id: true },
      });
      if (bot) await tx.botQuery.update({ where: { id: bot.id }, data: { inquiryId: inquiry.id } });
      await queueNotifications(tx, [
        {
          type: 'INQUIRY_UNANSWERED',
          title: 'استفسار جديد لم يجد له البوت إجابة',
          link: `/admin/support?inquiry=${inquiry.id}`,
          userIds: await permissionHolders(tx, 'support:respond'),
          email: false,
        },
      ]);
    });
    revalidatePath('/admin/support');
    return user
      ? 'أُرسل استفسارك لفريق المجلس. يصلك الرد في إشعاراتك.'
      : 'أُرسل استفسارك لفريق المجلس. إن تركت وسيلة تواصل سيتواصلون معك بها.';
  });
}

async function loadInquiry(id: string) {
  const inquiry = await db.supportInquiry.findUnique({
    where: { id },
    select: { id: true, question: true, status: true, askerId: true, answerMd: true },
  });
  if (!inquiry) throw notFound('الاستفسار');
  return inquiry;
}

/** support/assign — «أُسند لمسؤول» (§13.3): من يملك support:respond يتولّاه بنفسه */
export async function assignInquiryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'support:respond');
    const { inquiryId } = InquiryIdSchema.parse(formToObject(form));
    await loadInquiry(inquiryId);
    requirePermission(user, 'support:respond', { committeeId: null });
    const { count } = await db.supportInquiry.updateMany({
      where: { id: inquiryId, status: { in: ['NEW', 'IN_PROGRESS'] } },
      data: { status: 'IN_PROGRESS', assigneeId: user.id },
    });
    if (count === 0) throw conflict('أُغلق هذا الاستفسار أو رُدّ عليه. حدّث الصفحة.');
    revalidatePath('/admin/support');
    return 'تولّيت هذا الاستفسار.';
  });
}

/** support/close — إغلاق بلا رد: مكرر أو غير مفهوم أو مسيء (§13.3) */
export async function closeInquiryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'support:respond');
    const { inquiryId } = InquiryIdSchema.parse(formToObject(form));
    await loadInquiry(inquiryId);
    requirePermission(user, 'support:respond', { committeeId: null });
    const { count } = await db.supportInquiry.updateMany({
      where: { id: inquiryId, status: { in: ['NEW', 'IN_PROGRESS'] } },
      data: { status: 'CLOSED', assigneeId: user.id },
    });
    if (count === 0) throw conflict('أُغلق هذا الاستفسار أو رُدّ عليه. حدّث الصفحة.');
    revalidatePath('/admin/support');
    return 'أُغلق الاستفسار بلا رد.';
  });
}

/**
 * support/answer — الرد البشري بسطر inquiry.answer، وإشعار صاحبه (داخل المنصة + بريد — §8.2).
 * «إرسال + إضافة إلى FAQ» (§13.3) يحتاج faq:manage أيضًا، وينشئ FaqEntry نشطًا بسطر faq.create — يجده البوت فورًا (AC-18 ④).
 */
export async function answerInquiryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'support:respond');
    const data = AnswerInquirySchema.parse(formToObject(form));
    if (data.promote) requirePermission(user, 'faq:manage');
    const inquiry = await loadInquiry(data.inquiryId);
    requirePermission(user, 'support:respond', { committeeId: null });
    if (inquiry.status === 'ANSWERED' || inquiry.status === 'CLOSED') throw conflict('رُدّ على هذا الاستفسار أو أُغلق من قبل.');
    if (data.promote) {
      const category = await db.faqCategory.findFirst({ where: { id: data.categoryId, isActive: true }, select: { id: true } });
      if (!category) throw notFound('التصنيف');
    }

    const emailIds = await db.$transaction(async (tx) => {
      const now = new Date();
      const faq = data.promote
        ? await tx.faqEntry.create({
            data: {
              categoryId: data.categoryId!,
              question: data.faqQuestion ?? inquiry.question.slice(0, 300),
              answerMd: data.answer,
              keywords: data.keywords,
              createdById: user.id,
              updatedById: user.id,
            },
          })
        : null;
      const { count } = await tx.supportInquiry.updateMany({
        where: { id: inquiry.id, status: { in: ['NEW', 'IN_PROGRESS'] } },
        data: {
          status: 'ANSWERED',
          answerMd: data.answer,
          answeredById: user.id,
          answeredAt: now,
          assigneeId: user.id,
          promotedToFaq: !!faq,
          promotedFaqId: faq?.id ?? null,
        },
      });
      if (count === 0) throw conflict('رُدّ على هذا الاستفسار للتو. حدّث الصفحة.');
      await writeAudit(tx, user, 'inquiry.answer', 'SupportInquiry', inquiry.id, { status: inquiry.status }, {
        status: 'ANSWERED',
        promotedFaqId: faq?.id ?? null,
      });
      if (faq) {
        await writeAudit(tx, user, 'faq.create', 'FaqEntry', faq.id, null, {
          question: faq.question,
          categoryId: faq.categoryId,
          fromInquiry: inquiry.id,
        });
      }
      return queueNotifications(tx, [
        {
          type: 'INQUIRY_ANSWERED',
          title: 'وصل رد فريق المجلس على استفسارك',
          body: `سؤالك: ${inquiry.question.slice(0, 200)}\n\nالرد: ${data.answer.slice(0, 1500)}`,
          link: '/help',
          userIds: [inquiry.askerId],
          email: true,
        },
      ]);
    });
    sendEmailsAfterResponse(db, emailIds);
    revalidatePath('/admin/support');
    revalidatePath('/help');
    return data.promote ? 'أُرسل الرد وأُضيف إلى الأسئلة الشائعة.' : 'أُرسل الرد لصاحب الاستفسار.';
  });
}
