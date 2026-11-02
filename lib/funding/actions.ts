import 'server-only';
import type { SessionUser } from '@/lib/rbac';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { conflict, invalid, notFound } from '@/lib/errors';
import { FundingIdSchema, RecordFundingSchema, UpdateFundingSchema } from '@/lib/validation/initiatives';

// السجل المالي — §3.4 «فصل المهام المالية»: التسجيل لأمين الصندوق، والاعتماد للرئيس،
// وقيد funding_four_eyes يمنع اعتماد المسجِّل لقيده في قاعدة البيانات نفسها.
// المبلغ المؤمَّن مشتق من القيود الواردة المعتمدة فقط (securedTotals) — لا حقل يُكتب يدويًا.

function revalidateFinance(slug?: string | null, initiativeId?: string | null) {
  revalidatePath('/admin/finance');
  revalidatePath('/admin/reports');
  revalidatePath('/transparency/finance');
  if (initiativeId) revalidatePath(`/admin/initiatives/${initiativeId}`);
  if (slug) revalidatePath(`/initiatives/${slug}`);
  revalidatePath('/support');
}

async function assertOrganization(organizationId: string | null) {
  if (organizationId && !(await db.organization.findUnique({ where: { id: organizationId }, select: { id: true } }))) throw notFound('المؤسسة');
}

/** finance:record — قيد وارد أو مصروف، غير معتمد عند إنشائه */
export async function recordFunding(user: SessionUser, input: unknown): Promise<string | void> {
  requirePermission(user, 'finance:record');
  const data = RecordFundingSchema.parse(input);
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
  await assertOrganization(organizationId);

  await db.$transaction(async (tx) => {
    const record = await tx.fundingRecord.create({
      data: {
        direction: data.direction,
        amount: data.amount,
        currency,
        occurredAt: data.occurredAt,
        description: data.description ?? null,
        counterparty: data.counterparty ?? null,
        category: data.category ?? null,
        documentNumber: data.documentNumber ?? null,
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
}

/** التعديل والحذف لمُدخل القيد وحده وقبل اعتماده؛ بعد الاعتماد يصير القيد ثابتًا. */
async function ownPendingRecord(user: SessionUser, fundingId: string) {
  const record = await db.fundingRecord.findUnique({ where: { id: fundingId }, include: { initiative: { select: { slug: true } } } });
  if (!record) throw notFound('القيد');
  requirePermission(user, 'finance:record', {});
  if (record.approvedAt) throw conflict('اعتُمد هذا القيد، فلا يُعدَّل ولا يُحذف.');
  if (record.recordedById !== user.id) throw invalid('يعدّل القيد أو يحذفه من أدخله فقط.');
  return record;
}

/** finance:record — تعديل قيد معلّق. قيد العرض يبقى واردًا بعملة العرض (D29). */
export async function updateFunding(user: SessionUser, input: unknown): Promise<string | void> {
  requirePermission(user, 'finance:record');
  const data = UpdateFundingSchema.parse(input);
  const { initiative: previousInitiative, ...record } = await ownPendingRecord(user, data.fundingId);
  if (record.offerId && data.direction !== 'INCOMING') throw invalid('قيد عرض الدعم وارد دائمًا.');
  if (data.occurredAt > new Date()) throw invalid('تاريخ الحركة في المستقبل.', { occurredAt: ['تاريخ في المستقبل.'] });

  // قيد العرض مرتبط بمبادرة العرض ومؤسسته وعملته (D29)، فلا يغيّرها التعديل
  const initiativeId = record.offerId ? record.initiativeId : (data.initiativeId ?? null);
  const organizationId = record.offerId ? record.organizationId : (data.organizationId ?? null);
  const initiative = initiativeId ? await db.initiative.findUnique({ where: { id: initiativeId }, select: { slug: true } }) : null;
  if (initiativeId && !initiative) throw notFound('المبادرة');
  await assertOrganization(organizationId);

  await db.$transaction(async (tx) => {
    const after = {
      direction: data.direction,
      amount: data.amount,
      currency: record.offerId ? record.currency : data.currency,
      occurredAt: data.occurredAt,
      description: data.description ?? null,
      counterparty: data.counterparty ?? null,
      category: data.category ?? null,
      documentNumber: data.documentNumber ?? null,
      initiativeId,
      organizationId,
    };
    const { count } = await tx.fundingRecord.updateMany({ where: { id: record.id, approvedAt: null }, data: after });
    if (count === 0) throw conflict('اعتُمد هذا القيد للتو، فلا يُعدَّل.');
    await writeAudit(tx, user, 'funding.update', 'FundingRecord', record.id, record, after);
  });
  revalidateFinance(initiative?.slug, initiativeId);
  if (record.initiativeId !== initiativeId) revalidateFinance(previousInitiative?.slug, record.initiativeId);
  return 'عُدّل القيد، وما زال ينتظر الاعتماد.';
}

/** finance:record — حذف قيد معلّق. نسخته الكاملة تبقى في سطر التدقيق. */
export async function deleteFunding(user: SessionUser, input: unknown): Promise<string | void> {
  requirePermission(user, 'finance:record');
  const { fundingId } = FundingIdSchema.parse(input);
  const { initiative, ...record } = await ownPendingRecord(user, fundingId);

  await db.$transaction(async (tx) => {
    const { count } = await tx.fundingRecord.deleteMany({ where: { id: record.id, approvedAt: null } });
    if (count === 0) throw conflict('اعتُمد هذا القيد للتو، فلا يُحذف.');
    await writeAudit(tx, user, 'funding.delete', 'FundingRecord', record.id, record, null);
  });
  revalidateFinance(initiative?.slug, record.initiativeId);
  return 'حُذف القيد.';
}

/** finance:approve — الرئيس. لا اعتماد لقيد سجّله المعتمِد نفسه (التطبيق + funding_four_eyes) */
export async function approveFunding(user: SessionUser, input: unknown): Promise<string | void> {
  requirePermission(user, 'finance:approve');
  const { fundingId } = FundingIdSchema.parse(input);
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
}