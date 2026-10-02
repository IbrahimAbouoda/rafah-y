'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission, requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { conflict, invalid, notFound } from '@/lib/errors';
import { coveredStatus, OFFERABLE_INITIATIVE_STATUSES, OPEN_NEED_STATUSES } from '@/lib/initiatives/workflow';
import { allScopeHoldersOf, sendEmailsAfterResponse, queueNotifications } from '@/lib/notify';
import { organizationMemberIds } from '@/lib/organizations';
import { DecideOfferSchema, SubmitOfferSchema } from '@/lib/validation/initiatives';

// عروض الدعم — PRD §5.3 · AC-10 · D27 (نطاق المؤسسة) · D29 (القيد يسجّله أمين الصندوق)

function revalidateOffers(slug?: string) {
  revalidatePath('/partner/offers');
  revalidatePath('/partner/needs');
  revalidatePath('/partner');
  revalidatePath('/admin/initiatives');
  revalidatePath('/admin/finance');
  revalidatePath('/support');
  if (slug) revalidatePath(`/initiatives/${slug}`);
}

/** offers:create («خاص» = مؤسسته) — عرض مالي أو غير مالي، مرتبط باحتياج متى أمكن */
export async function submitOfferAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'offers:create');
    // أنواع الدعم خانات متعددة بنفس الاسم
    const data = SubmitOfferSchema.parse({ ...formToObject(form), types: form.getAll('types') });

    // D27: المستخدم يقدّم باسم مؤسسة ينتمي إليها فقط
    requirePermission(user, 'offers:create', { ownerId: await organizationMemberIds(db, data.organizationId) });

    const initiative = await db.initiative.findUnique({
      where: { id: data.initiativeId },
      select: { id: true, slug: true, title: true, status: true },
    });
    if (!initiative || !OFFERABLE_INITIATIVE_STATUSES.includes(initiative.status)) {
      throw invalid('المبادرة غير منشورة أو لم تعد تقبل عروضًا.');
    }
    if (data.needId) {
      const need = await db.initiativeNeed.findFirst({ where: { id: data.needId, initiativeId: initiative.id } });
      if (!need) throw notFound('الاحتياج');
      if (!OPEN_NEED_STATUSES.includes(need.status)) throw conflict('هذا الاحتياج مغطّى أو ملغى. اختر احتياجًا مفتوحًا.');
    }

    const emailIds = await db.$transaction(async (tx) => {
      const offer = await tx.supportOffer.create({
        data: {
          initiativeId: initiative.id,
          needId: data.needId ?? null,
          organizationId: data.organizationId,
          submittedById: user.id,
          types: data.types,
          amount: data.amount ?? null,
          currency: data.currency,
          note: data.note ?? null,
        },
        select: { id: true, organization: { select: { name: true } } },
      });
      // §8.2: وصول عرض دعم ⇒ الرئيس وأمين السر (من يقرّر العروض ومن يدير المؤسسات بنطاق الكل)
      return queueNotifications(tx, [
        {
          type: 'OFFER_RECEIVED',
          title: `عرض دعم جديد من ${offer.organization.name}`,
          body: `للمبادرة: ${initiative.title}`,
          link: `/admin/initiatives/${initiative.id}`,
          userIds: await allScopeHoldersOf(tx, ['offers:decide', 'organizations:manage']),
          email: true,
        },
      ]);
    });
    sendEmailsAfterResponse(db, emailIds);
    revalidateOffers(initiative.slug);
    return 'وصل عرضك. يصلك إشعار بقرار المجلس.';
  });
}

/**
 * offers:decide — الرئيس. القبول: يضيف الشريك، ويحدّث حالة الاحتياج من العروض المقبولة.
 * لا ينشئ قيدًا ماليًا ولا يعتمده (AC-10 · D29): أمين الصندوق يسجّل القيد، والرئيس يعتمده لاحقًا.
 */
export async function decideOfferAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'offers:decide');
    const data = DecideOfferSchema.parse(formToObject(form));
    const offer = await db.supportOffer.findUnique({
      where: { id: data.offerId },
      include: {
        initiative: { select: { id: true, slug: true, title: true, committeeId: true } },
        organization: { select: { id: true, name: true } },
      },
    });
    if (!offer) throw notFound('العرض');
    requirePermission(user, 'offers:decide', { committeeId: offer.initiative.committeeId });
    if (offer.status !== 'SUBMITTED') throw conflict('حُسم هذا العرض من قبل.');

    const accepted = data.decision === 'ACCEPTED';
    const emailIds = await db.$transaction(async (tx) => {
      const { count } = await tx.supportOffer.updateMany({
        where: { id: offer.id, status: 'SUBMITTED' },
        data: { status: data.decision, decidedById: user.id, decidedAt: new Date(), decisionNote: data.note ?? null },
      });
      if (count === 0) throw conflict('حُسم هذا العرض للتو. حدّث الصفحة.');

      let needAfter: string | null = null;
      if (accepted) {
        await tx.initiativePartner.upsert({
          where: { initiativeId_organizationId: { initiativeId: offer.initiativeId, organizationId: offer.organizationId } },
          create: {
            initiativeId: offer.initiativeId,
            organizationId: offer.organizationId,
            role: data.partnerRole ?? 'شريك داعم',
            offerId: offer.id,
          },
          update: {},
        });
        if (offer.needId) {
          const need = await tx.initiativeNeed.findUniqueOrThrow({ where: { id: offer.needId } });
          const acceptedOffers = await tx.supportOffer.findMany({
            where: { needId: need.id, status: 'ACCEPTED' },
            select: { amount: true, currency: true },
          });
          const status = coveredStatus(need, acceptedOffers);
          if (status !== need.status) {
            await tx.initiativeNeed.update({ where: { id: need.id }, data: { status } });
            await writeAudit(tx, user, 'need.change', 'InitiativeNeed', need.id, { status: need.status }, { status, offerId: offer.id });
          }
          needAfter = status;
        }
      }
      await writeAudit(tx, user, 'offer.decide', 'SupportOffer', offer.id, { status: offer.status }, {
        status: data.decision,
        decisionNote: data.note ?? null,
        needStatus: needAfter,
      });

      // §8.2: قرار على العرض ⇒ المؤسسة (كل أعضائها)
      return queueNotifications(tx, [
        {
          type: 'OFFER_DECIDED',
          title: accepted
            ? `قُبل عرضكم لمبادرة «${offer.initiative.title}»`
            : `اعتذر المجلس عن عرضكم لمبادرة «${offer.initiative.title}»`,
          body: data.note,
          link: '/partner/offers',
          userIds: await organizationMemberIds(tx, offer.organizationId),
          email: true,
        },
      ]);
    });
    sendEmailsAfterResponse(db, emailIds);
    revalidateOffers(offer.initiative.slug);
    revalidatePath(`/admin/initiatives/${offer.initiativeId}`);
    return accepted
      ? offer.types.includes('FUNDING') && offer.amount
        ? `قُبل العرض وأُضيفت ${offer.organization.name} شريكًا. يسجّل أمين الصندوق القيد عند وصول المبلغ.`
        : `قُبل العرض وأُضيفت ${offer.organization.name} شريكًا.`
      : 'اعتُذر عن العرض، وأُشعرت المؤسسة بالسبب.';
  });
}
