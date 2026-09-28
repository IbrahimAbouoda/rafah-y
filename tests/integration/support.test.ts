import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { collectMetrics } from '@/lib/reports/collect';
import { saveFaqAction, setFaqActiveAction } from '@/server/actions/faq';
import {
  answerInquiryAction,
  askBotAction,
  assignInquiryAction,
  closeInquiryAction,
  markUnhelpfulAction,
  sendInquiryAction,
} from '@/server/actions/support';
import { actAs, createUser, form, freshIp } from '../support/factories';

// Sprint 5 — المحور ٥: AC-18 (بوت الاستفسارات والرد البشري) · M9 · §17 بند 11.
// قاعدة FAQ من البذرة الأساسية (prisma/faq.seed.ts) — 12 سؤالًا نشطًا.

async function ask(question: string) {
  const res = await askBotAction(null, form({ question }));
  expect(res).toMatchObject({ ok: true });
  return res!.data!;
}

const faqId = async (question: string) => (await db.faqEntry.findFirstOrThrow({ where: { question } })).id;

describe('support/ask — المطابقة (§13.2)', () => {
  it('سؤال يطابق: إجابة معتمدة من FaqEntry، useCount++، و BotQuery = ANSWERED', async () => {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    const id = await faqId('كيف أتابع شكواي؟');
    const before = (await db.faqEntry.findUniqueOrThrow({ where: { id } })).useCount;
    const data = await ask('كيف اتابع شكوايَ بالرقم المرجعي؟');
    expect(data.answers[0]!.id).toBe(id);
    const faq = await db.faqEntry.findUniqueOrThrow({ where: { id } });
    expect(data.answers[0]!.answerMd).toBe(faq.answerMd);
    expect(faq.useCount).toBe(before + 1);
    expect(await db.botQuery.findUniqueOrThrow({ where: { id: data.botQueryId } })).toMatchObject({ status: 'ANSWERED', matchedFaqId: id });
  });

  it('① سؤال بلا تطابق لا يعيد أي نص إجابة، ويُسجَّل UNRESOLVED_ESCALATED', async () => {
    await actAs(null);
    freshIp();
    const data = await ask('ما سعر صرف الدولار اليوم في السوق');
    expect(data.answers).toEqual([]);
    expect((await db.botQuery.findUniqueOrThrow({ where: { id: data.botQueryId } })).status).toBe('UNRESOLVED_ESCALATED');
  });

  it('«لم تفدني» تحوّل السؤال إلى غير محلول', async () => {
    await actAs(null);
    freshIp();
    const data = await ask('كيف أقدم فكرة');
    expect(data.answers.length).toBeGreaterThan(0);
    expect(await markUnhelpfulAction(null, form({ botQueryId: data.botQueryId }))).toMatchObject({ ok: true });
    expect((await db.botQuery.findUniqueOrThrow({ where: { id: data.botQueryId } })).status).toBe('UNRESOLVED_ESCALATED');
  });

  it('حد المعدل: 20 سؤالًا في الساعة لكل حساب (§6.4)', async () => {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    for (let i = 0; i < 20; i++) expect(await askBotAction(null, form({ question: 'كيف أتطوع' }))).toMatchObject({ ok: true });
    expect(await askBotAction(null, form({ question: 'كيف أتطوع' }))).toMatchObject({ ok: false, message: expect.stringContaining('محاولات كثيرة') });
  });
});

describe('support/ask (إرسال) — SupportInquiry NEW', () => {
  it('زائر: askerId فارغ، وسيلة التواصل محفوظة، مربوط بسؤال البوت، وفريق الدعم يُشعَر داخل المنصة', async () => {
    const secretary = await createUser(['secretary']);
    await actAs(null);
    freshIp();
    const { botQueryId } = await ask('هل يمكن حجز قاعة البلدية لحفل تخرج');
    const res = await sendInquiryAction(null, form({ question: 'هل يمكن حجز قاعة البلدية لحفل تخرج', botQueryId, contactHint: 'visitor@example.test' }));
    expect(res).toMatchObject({ ok: true });
    const bot = await db.botQuery.findUniqueOrThrow({ where: { id: botQueryId }, include: { inquiry: true } });
    expect(bot.inquiry).toMatchObject({ status: 'NEW', askerId: null, contactHint: 'visitor@example.test', matchedFaqId: null });
    const n = await db.notification.findMany({ where: { userId: secretary.id, type: 'INQUIRY_UNANSWERED' } });
    expect(n.map((x) => x.channel)).toEqual(['IN_APP']);
    // لا يُرسل السؤال نفسه مرتين
    expect(await sendInquiryAction(null, form({ question: 'مرة أخرى', botQueryId }))).toMatchObject({ ok: false });
  });

  it('المسجَّل: askerId له، ووسيلة التواصل لا تُحفظ', async () => {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    await sendInquiryAction(null, form({ question: 'استفسار مباشر من شاب مسجل', contactHint: '0599000000' }));
    const inq = await db.supportInquiry.findFirstOrThrow({ where: { askerId: youth.id } });
    expect(inq.contactHint).toBeNull();
  });

  it('مسجَّل بلا support:ask (مؤسسة) لا يرسل', async () => {
    const partner = await createUser(['partner']);
    await actAs(partner.id);
    expect(await sendInquiryAction(null, form({ question: 'استفسار من مؤسسة' }))).toMatchObject({ ok: false, message: expect.stringContaining('لا تملك صلاحية') });
  });
});

describe('الرد البشري وتحويله إلى FAQ — AC-18 ③④⑥', () => {
  async function inquiryFrom(question: string) {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    await sendInquiryAction(null, form({ question }));
    const inquiry = await db.supportInquiry.findFirstOrThrow({ where: { askerId: youth.id } });
    return { youth, inquiry };
  }

  it('③ الرد يصل صاحبه (داخل المنصة + بريد) بسطر inquiry.answer', async () => {
    const { youth, inquiry } = await inquiryFrom('متى تفتح اللجان باب العضوية؟');
    const vp = await createUser(['vice_president']);
    await actAs(vp.id);
    expect(await assignInquiryAction(null, form({ inquiryId: inquiry.id }))).toMatchObject({ ok: true });
    expect(await answerInquiryAction(null, form({ inquiryId: inquiry.id, answer: 'مع بداية كل دورة للمجلس.' }))).toMatchObject({ ok: true });
    expect(await db.supportInquiry.findUniqueOrThrow({ where: { id: inquiry.id } })).toMatchObject({
      status: 'ANSWERED',
      answeredById: vp.id,
      promotedToFaq: false,
    });
    const channels = (await db.notification.findMany({ where: { userId: youth.id, type: 'INQUIRY_ANSWERED' } })).map((n) => n.channel).sort();
    expect(channels).toEqual(['EMAIL', 'IN_APP']);
    expect(await db.auditLog.count({ where: { action: 'inquiry.answer', entityId: inquiry.id } })).toBe(1);
    // لا رد ثانٍ
    expect(await answerInquiryAction(null, form({ inquiryId: inquiry.id, answer: 'رد ثانٍ مكرر' }))).toMatchObject({ ok: false });
  });

  it('النائب (بلا faq:manage) لا يحوّل الرد إلى FAQ', async () => {
    const { inquiry } = await inquiryFrom('سؤال للنائب عن التحويل');
    const vp = await createUser(['vice_president']);
    await actAs(vp.id);
    const cat = await db.faqCategory.findFirstOrThrow();
    expect(await answerInquiryAction(null, form({ inquiryId: inquiry.id, answer: 'رد مع تحويل', promote: 'on', categoryId: cat.id }))).toMatchObject({
      ok: false,
      message: expect.stringContaining('لا تملك صلاحية'),
    });
    expect((await db.supportInquiry.findUniqueOrThrow({ where: { id: inquiry.id } })).status).toBe('NEW');
  });

  it('④ «إرسال + إضافة إلى FAQ» ينشئ سؤالًا نشطًا يجده البوت في المحاولة التالية', async () => {
    const question = 'هل يمنح المجلس شهادات للمتطوعين في حملة التشجير؟';
    const { inquiry } = await inquiryFrom(question);
    const secretary = await createUser(['secretary']);
    await actAs(secretary.id);
    const cat = await db.faqCategory.findFirstOrThrow({ where: { slug: 'participation' } });
    const res = await answerInquiryAction(
      null,
      form({ inquiryId: inquiry.id, answer: 'نعم، شهادة مشاركة بعد اعتماد ساعاتك.', promote: 'on', categoryId: cat.id, keywords: 'شهادة تطوع، حملة التشجير' }),
    );
    expect(res).toMatchObject({ ok: true });
    const updated = await db.supportInquiry.findUniqueOrThrow({ where: { id: inquiry.id } });
    expect(updated.promotedToFaq).toBe(true);
    const faq = await db.faqEntry.findUniqueOrThrow({ where: { id: updated.promotedFaqId! } });
    expect(faq).toMatchObject({ isActive: true, question, keywords: ['شهادة تطوع', 'حملة التشجير'] });
    expect(await db.auditLog.count({ where: { action: 'faq.create', entityId: faq.id } })).toBe(1);

    await actAs(null);
    freshIp();
    const next = await ask('ابغى شهادة تطوع من حملة التشجير');
    expect(next.answers[0]!.id).toBe(faq.id);
  });

  it('الإغلاق بلا رد، ومراقب البلدية بلا support:respond', async () => {
    const { inquiry } = await inquiryFrom('رسالة غير مفهومة للاختبار');
    const observer = await createUser(['municipality_observer']);
    await actAs(observer.id);
    expect(await closeInquiryAction(null, form({ inquiryId: inquiry.id }))).toMatchObject({ ok: false });
    const president = await createUser(['council_president']);
    await actAs(president.id);
    expect(await closeInquiryAction(null, form({ inquiryId: inquiry.id }))).toMatchObject({ ok: true });
    expect((await db.supportInquiry.findUniqueOrThrow({ where: { id: inquiry.id } })).status).toBe('CLOSED');
  });
});

describe('faq/create · update · disable — AC-18 ⑤⑥', () => {
  it('سؤال معطّل لا يظهر فورًا، وكل تغيير بسطر تدقيق', async () => {
    const secretary = await createUser(['secretary']);
    await actAs(secretary.id);
    const cat = await db.faqCategory.findFirstOrThrow({ where: { slug: 'about' } });
    const question = 'أين مقر المجلس البلدي الشبابي في رفح؟';
    expect(await saveFaqAction(null, form({ categoryId: cat.id, question, answer: 'في مبنى البلدية، الطابق الثاني.', keywords: 'مقر المجلس' }))).toMatchObject({ ok: true });
    const faq = await db.faqEntry.findFirstOrThrow({ where: { question } });
    expect(await db.auditLog.count({ where: { action: 'faq.create', entityId: faq.id } })).toBe(1);

    expect(await saveFaqAction(null, form({ faqId: faq.id, categoryId: cat.id, question, answer: 'في مبنى البلدية الجديد.', keywords: 'مقر المجلس، عنوان' }))).toMatchObject({ ok: true });
    expect(await db.auditLog.count({ where: { action: 'faq.update', entityId: faq.id } })).toBe(1);

    await actAs(null);
    freshIp();
    expect((await ask('وين مقر المجلس')).answers[0]!.id).toBe(faq.id);

    await actAs(secretary.id);
    expect(await setFaqActiveAction(null, form({ faqId: faq.id, active: 'false' }))).toMatchObject({ ok: true });
    expect(await db.auditLog.count({ where: { action: 'faq.disable', entityId: faq.id } })).toBe(1);
    await actAs(null);
    freshIp();
    expect((await ask('وين مقر المجلس')).answers.map((a) => a.id)).not.toContain(faq.id);
  });

  it('النائب (بلا faq:manage) لا يعدّل القاعدة', async () => {
    const vp = await createUser(['vice_president']);
    await actAs(vp.id);
    const cat = await db.faqCategory.findFirstOrThrow();
    expect(await saveFaqAction(null, form({ categoryId: cat.id, question: 'سؤال غير مسموح', answer: 'إجابة غير مسموحة' }))).toMatchObject({
      ok: false,
      message: expect.stringContaining('لا تملك صلاحية'),
    });
  });
});

describe('M9 — أسئلة البوت المحلولة', () => {
  it('ANSWERED ÷ كل أسئلة الفترة', async () => {
    const at = new Date('2011-06-10T10:00:00Z');
    await db.botQuery.createMany({
      data: [
        { status: 'ANSWERED', createdAt: at },
        { status: 'ANSWERED', createdAt: at },
        { status: 'ANSWERED', createdAt: at },
        { status: 'UNRESOLVED_ESCALATED', createdAt: at },
      ],
    });
    const s = await collectMetrics({ from: '2011-06-01', to: '2011-06-30' }, { all: true });
    expect(s.values.M9).toBe(0.75);
    expect((await collectMetrics({ from: '2011-07-01', to: '2011-07-31' }, { all: true })).values.M9).toBeNull();
  });
});
