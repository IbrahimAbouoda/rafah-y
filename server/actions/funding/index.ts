'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission, requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { conflict, invalid, notFound } from '@/lib/errors';
import { FundingIdSchema, RecordFundingSchema } from '@/lib/validation/initiatives';

// السجل المالي — §3.4 «فصل المهام المالية»: التسجيل لأمين الصندوق، والاعتماد للرئيس،
// وقيد funding_four_eyes يمنع اعتماد المسجِّل لقيده في قاعدة البيانات نفسها.
// المبلغ المؤمَّن مشتق من القيود الواردة المعتمدة فقط (securedTotals) — لا حقل يُكتب يدويًا.

function revalidateFinance(slug?: string | null, initiativeId?: string | null) {
  revalidatePath('/admin/finance');
  if (initiativeId) revalidatePath(`/admin/initiatives/${initiativeId}`);
  if (slug) revalidatePath(`/initiatives/${slug}`);
  revalidatePath('/support');
}

/** finance:record — قيد وارد أو مصروف، غير معتمد عند إنشائه */
export async function recordFundingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'finance:record');
    const data = RecordFundingSchema.parse(formToObject(form));
    requirePermission(user, 'finance:record', {});

    let initiativeId = data.initiativeId ?? null;
    let organizationId = data.organizationId ?? null;
    let currency = data.currency;
    if (data.offerId) {
      // D29: قيد العرض المالي المقبول — المبادرة والمؤسسة والعملة من العرض نفسه
      const offer = await db.supportOffer.findUnique({
        where: { id: data.offerId },
        select: { status: true, initiativeId: true, organizationId: true, currency: true, _count: { select: { fundingRecords: true } } },
      });
      if (!offer) throw notFound('العرض');
      if (offer.status !== 'ACCEPTED') throw invalid('يُسجَّل قيد العرض بعد قبوله فقط.');
      if (offer._count.fundingRecords > 0) throw conflict('سُجّل قيد هذا العرض من قبل.');
      if (data.direction !== 'INCOMING') throw invalid('قيد عرض الدعم وارد دائمًا.');
      initiativeId = offer.initiativeId;
      organizationId = offer.organizationId;
      currency = offer.currency as typeof currency;
    }
    if (data.occurredAt > new Date()) throw invalid('تاريخ الحركة في المستقبل.', { occurredAt: ['تاريخ في المستقبل.'] });

    const initiative = initiativeId
      ? await db.initiative.findUnique({ where: { id: initiativeId }, select: { id: true, slug: true } })
      : null;
    if (initiativeId && !initiative) throw notFound('المبادرة');

    await db.$transaction(async (tx) => {
      const record = await tx.fundingRecord.create({
        data: {
          direction: data.direction,
          amount: data.amount,
          currency,
          occurredAt: data.occurredAt,
          description: data.description ?? null,
          initiativeId,
          organizationId,
          offerId: data.offerId ?? null,
          recordedById: user.id,
        },
      });
      await writeAudit(tx, user, 'funding.record', 'FundingRecord', record.id, null, record);
    });
    revalidateFinance(initiative?.slug, initiativeId);
    return 'سُجّل القيد، وينتظر اعتماد الرئيس. لا يُحتسب في المبلغ المؤمَّن قبل اعتماده.';
  });
}

/** finance:approve — الرئيس. لا اعتماد لقيد سجّله المعتمِد نفسه (التطبيق + funding_four_eyes) */
export async function approveFundingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'finance:approve');
    const { fundingId } = FundingIdSchema.parse(formToObject(form));
    const record = await db.fundingRecord.findUnique({
      where: { id: fundingId },
      select: { id: true, recordedById: true, approvedAt: true, initiativeId: true, initiative: { select: { slug: true } } },
    });
    if (!record) throw notFound('القيد');
    requirePermission(user, 'finance:approve', {});
    if (record.approvedAt) throw conflict('اعتُمد هذا القيد من قبل.');
    if (record.recordedById === user.id) throw invalid('لا يمكنك اعتماد قيد سجّلته بنفسك. يعتمده شخص آخر.');

    await db.$transaction(async (tx) => {
      const { count } = await tx.fundingRecord.updateMany({
        where: { id: record.id, approvedAt: null },
        data: { approvedById: user.id, approvedAt: new Date() },
      });
      if (count === 0) throw conflict('اعتُمد هذا القيد للتو.');
      await writeAudit(tx, user, 'funding.approve', 'FundingRecord', record.id, { approvedAt: null }, { approvedById: user.id });
    });
    revalidateFinance(record.initiative?.slug, record.initiativeId);
    return 'اعتُمد القيد، ودخل في المبلغ المؤمَّن.';
  });
}
