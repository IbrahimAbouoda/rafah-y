'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission, requireUser } from '@/lib/auth';
import { formToObject, runAction, runActionData, type ActionState, type DataState } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { conflict, forbidden, invalid, notFound } from '@/lib/errors';
import { Prisma } from '@/lib/generated/prisma/client';
import { dispatchEmails, queueNotifications } from '@/lib/notify';
import {
  APPLICATION_STATUS_LABELS,
  applyBlocker,
  CLOSABLE_OPPORTUNITY_STATUSES,
  nextApplicationStatuses,
  OPPORTUNITY_REVIEW,
  publishBlocker,
  WITHDRAWABLE_APPLICATION_STATUSES,
  type ApplicantView,
} from '@/lib/opportunities/workflow';
import { organizationMemberIds } from '@/lib/organizations';
import { can } from '@/lib/rbac';
import {
  ApplicationIdSchema,
  ApplicationStatusSchema,
  ApplySchema,
  OpportunityIdSchema,
  OpportunitySchema,
  ReviewOpportunitySchema,
} from '@/lib/validation/opportunities';

// الفرص — PRD §5.4 · AC-11 · D31 (ما تراه المؤسسة) · D33 (حالة الطلب)
// «خاص» للمؤسسة = فرص مؤسساتها وطلباتها (D27): أعضاء المؤسسة يُمرَّرون إلى can() كـ ownerId.

function revalidateOpportunities(id?: string) {
  revalidatePath('/opportunities');
  revalidatePath('/partner/opportunities');
  revalidatePath('/admin/opportunities');
  revalidatePath('/me/applications');
  if (id) revalidatePath(`/opportunities/${id}`);
}

const orgOwners = async (organizationId: string | null) => (organizationId ? organizationMemberIds(db, organizationId) : []);

/** opportunities:create («خاص» = مؤسسته) — تدخل المراجعة PENDING_REVIEW ولا تُنشر قبل opportunities:publish */
export async function createOpportunityAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'opportunities:create');
    const data = OpportunitySchema.parse({ ...formToObject(form), skillIds: form.getAll('skillIds') });
    requirePermission(user, 'opportunities:create', { ownerId: await orgOwners(data.organizationId) });

    if (data.skillIds.length && (await db.skill.count({ where: { id: { in: data.skillIds } } })) !== data.skillIds.length) {
      throw invalid('بعض المهارات لم تعد موجودة. حدّث الصفحة واختر من جديد.');
    }
    if (data.areaId && !(await db.area.findUnique({ where: { id: data.areaId }, select: { id: true } }))) {
      throw invalid('المنطقة غير متاحة.', { areaId: ['اختر المنطقة من القائمة.'] });
    }

    await db.opportunity.create({
      data: {
        title: data.title,
        description: data.description,
        type: data.type,
        applyMode: data.applyMode,
        // الفرصة الداخلية لا تحمل رابطًا خارجيًا، فلا يلتبس مسار التقديم
        externalUrl: data.applyMode === 'EXTERNAL' ? data.externalUrl! : null,
        seats: data.seats ?? null,
        deadline: data.deadline ?? null,
        areaId: data.areaId ?? null,
        organizationId: data.organizationId,
        createdById: user.id,
        status: 'PENDING_REVIEW',
        skills: { create: data.skillIds.map((skillId) => ({ skillId })) },
      },
    });
    revalidateOpportunities();
    return 'وصلت الفرصة لأمانة السر للمراجعة. تظهر للشباب بعد نشرها.';
  });
}

/** opportunities:publish — نشر الفرصة أو رفضها، بسطر opportunity.publish يحمل القرار */
export async function reviewOpportunityAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'opportunities:publish');
    const data = ReviewOpportunitySchema.parse(formToObject(form));
    const opportunity = await db.opportunity.findUnique({
      where: { id: data.opportunityId },
      select: { id: true, title: true, status: true, organizationId: true, deadline: true },
    });
    if (!opportunity) throw notFound('الفرصة');
    // لا نطاق لجنة للفرصة: المراجعة لمن يملك الصلاحية بنطاق «الكل»
    requirePermission(user, 'opportunities:publish', { committeeId: null });
    if (!OPPORTUNITY_REVIEW[opportunity.status].includes(data.decision)) throw conflict('رُوجعت هذه الفرصة من قبل.');
    if (data.decision === 'PUBLISHED') {
      const blocker = publishBlocker(opportunity);
      if (blocker) throw conflict(blocker);
    }

    const published = data.decision === 'PUBLISHED';
    const emailIds = await db.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.opportunity.updateMany({
        where: { id: opportunity.id, status: 'PENDING_REVIEW' },
        data: { status: data.decision, reviewedById: user.id, publishedAt: published ? now : null },
      });
      if (count === 0) throw conflict('رُوجعت هذه الفرصة للتو. حدّث الصفحة.');
      await writeAudit(tx, user, 'opportunity.publish', 'Opportunity', opportunity.id, { status: opportunity.status }, {
        status: data.decision,
      });
      // §8.2 «نشر فرصة»: داخل المنصة فقط، بلا بريد جماعي — تُشعَر المؤسسة صاحبتها
      return published
        ? queueNotifications(tx, [
            {
              type: 'OPPORTUNITY_PUBLISHED',
              title: `نُشرت فرصتكم «${opportunity.title}»`,
              link: '/partner/opportunities',
              userIds: opportunity.organizationId ? await organizationMemberIds(tx, opportunity.organizationId) : [],
              email: false,
            },
          ])
        : [];
    });
    await dispatchEmails(db, emailIds);
    revalidateOpportunities(opportunity.id);
    return published ? 'نُشرت الفرصة وتظهر الآن في بوابة الفرص.' : 'رُفضت الفرصة ولن تظهر للشباب.';
  });
}

/** إغلاق فرصة منشورة: من المؤسسة صاحبتها (opportunities:create) أو من المراجِع (opportunities:publish) */
export async function closeOpportunityAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    if (!can(user, 'opportunities:create') && !can(user, 'opportunities:publish')) throw forbidden();
    const { opportunityId } = OpportunityIdSchema.parse(formToObject(form));
    const opportunity = await db.opportunity.findUnique({ where: { id: opportunityId }, select: { id: true, status: true, organizationId: true } });
    if (!opportunity) throw notFound('الفرصة');
    const owners = await orgOwners(opportunity.organizationId);
    // الفرصة بلا لجنة: committeeId = null لا يطابق أي منحة لجنة، فلا يمرّ إلا نطاق «الكل» — كما في reviewOpportunityAction
    if (!can(user, 'opportunities:publish', { committeeId: null }) && !can(user, 'opportunities:create', { ownerId: owners })) {
      throw forbidden();
    }
    if (!CLOSABLE_OPPORTUNITY_STATUSES.includes(opportunity.status)) throw conflict('الفرصة ليست منشورة، فلا تُغلق.');
    // مشروط بالحالة في نفس الكتابة: لا يُغلق ما تغيّرت حالته بين القراءة والحفظ
    const { count } = await db.opportunity.updateMany({
      where: { id: opportunity.id, status: { in: CLOSABLE_OPPORTUNITY_STATUSES } },
      data: { status: 'CLOSED' },
    });
    if (count === 0) throw conflict('تغيّرت حالة الفرصة للتو. حدّث الصفحة.');
    revalidateOpportunities(opportunity.id);
    return 'أُغلقت الفرصة، ولم تعد تقبل طلبات.';
  });
}

/**
 * opportunities:apply («خاص») — طلب واحد لكل فرصة (AC-11 ①)، بموافقة صريحة لهذا الطلب وحده (§6.8).
 * الفرصة الخارجية والمنتهي موعدها لا تقبلان طلبًا (AC-11 ④ · §5.4).
 */
export async function applyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'opportunities:apply');
    const data = ApplySchema.parse(formToObject(form));
    requirePermission(user, 'opportunities:apply', { ownerId: user.id });

    const opportunity = await db.opportunity.findUnique({
      where: { id: data.opportunityId },
      select: { id: true, status: true, applyMode: true, deadline: true },
    });
    if (!opportunity) throw notFound('الفرصة');
    const blocker = applyBlocker(opportunity);
    if (blocker) throw conflict(blocker);

    const existing = await db.opportunityApplication.findUnique({
      where: { opportunityId_applicantId: { opportunityId: opportunity.id, applicantId: user.id } },
      select: { id: true },
    });
    if (existing) throw conflict('قدّمت على هذه الفرصة من قبل. تابع طلبك من «طلباتي».');

    try {
      await db.opportunityApplication.create({
        data: {
          opportunityId: opportunity.id,
          applicantId: user.id,
          message: data.message ?? null,
          shareProfile: data.shareProfile,
        },
      });
    } catch (e) {
      // طلبان متزامنان: القيد الفريد [opportunityId, applicantId] يحسمهما
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw conflict('قدّمت على هذه الفرصة من قبل. تابع طلبك من «طلباتي».');
      }
      throw e;
    }
    revalidateOpportunities(opportunity.id);
    return data.shareProfile
      ? 'وصل طلبك، ووافقت على مشاركة ملفك مع الجهة. تابع حالته من «طلباتي».'
      : 'وصل طلبك دون مشاركة ملفك: ترى الجهة أن أحدًا تقدّم، ولا ترى بياناتك ولا تستطيع التواصل معك.';
  });
}

/** المتقدّم يسحب طلبه ما دام غير محسوم */
export async function withdrawApplicationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'opportunities:apply');
    const { applicationId } = ApplicationIdSchema.parse(formToObject(form));
    const application = await db.opportunityApplication.findUnique({
      where: { id: applicationId },
      select: { id: true, applicantId: true, status: true, opportunityId: true },
    });
    if (!application) throw notFound('الطلب');
    requirePermission(user, 'opportunities:apply', { ownerId: application.applicantId });
    const { count } = await db.opportunityApplication.updateMany({
      where: { id: application.id, status: { in: WITHDRAWABLE_APPLICATION_STATUSES } },
      data: { status: 'WITHDRAWN' },
    });
    if (count === 0) throw conflict('حُسم هذا الطلب، فلا يُسحب.');
    revalidateOpportunities(application.opportunityId);
    return 'سُحب طلبك.';
  });
}

async function loadApplicationForOrg(applicationId: string) {
  const application = await db.opportunityApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      shareProfile: true,
      applicantId: true,
      opportunity: { select: { id: true, title: true, organizationId: true } },
    },
  });
  if (!application) throw notFound('الطلب');
  return application;
}

/**
 * D33: المؤسسة تغيّر حالة الطلب (opportunities:applicants بنطاق مؤسستها) — للموافق صاحبه على المشاركة فقط.
 * §8.2 «تغيّر حالة طلب فرصة» ⇒ المتقدّم داخل المنصة وبالبريد.
 */
export async function setApplicationStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'opportunities:applicants');
    const data = ApplicationStatusSchema.parse(formToObject(form));
    const application = await loadApplicationForOrg(data.applicationId);
    requirePermission(user, 'opportunities:applicants', { ownerId: await orgOwners(application.opportunity.organizationId) });
    if (!application.shareProfile) throw conflict('لم يوافق المتقدّم على مشاركة ملفه، فلا يُدار طلبه من المؤسسة.');
    if (!nextApplicationStatuses(application.status, true).includes(data.toStatus)) {
      throw conflict(`لا يمكن نقل طلب «${APPLICATION_STATUS_LABELS[application.status]}» إلى «${APPLICATION_STATUS_LABELS[data.toStatus]}».`);
    }

    const emailIds = await db.$transaction(async (tx) => {
      const { count } = await tx.opportunityApplication.updateMany({
        where: { id: application.id, status: application.status },
        data: { status: data.toStatus },
      });
      if (count === 0) throw conflict('تغيّرت حالة الطلب للتو. حدّث الصفحة.');
      return queueNotifications(tx, [
        {
          type: 'APPLICATION_STATUS_CHANGED',
          title: `طلبك على «${application.opportunity.title}»: ${APPLICATION_STATUS_LABELS[data.toStatus]}`,
          link: '/me/applications',
          userIds: [application.applicantId],
          email: true,
        },
      ]);
    });
    await dispatchEmails(db, emailIds);
    revalidateOpportunities(application.opportunity.id);
    return `صار الطلب «${APPLICATION_STATUS_LABELS[data.toStatus]}»، وأُشعر المتقدّم.`;
  });
}

/**
 * viewApplicant — D31: بيانات المتقدّم لا تُرسل مع الصفحة؛ تُطلب صراحة لطلب واحد،
 * وتصل فقط إن كان shareProfile = true في نفس سجل الطلب (§5.4)، وكل قراءة بسطر application.view (AC-11 ③).
 */
export async function viewApplicantAction(_prev: unknown, form: FormData): Promise<DataState<ApplicantView>> {
  return runActionData(async () => {
    const user = await requireUser();
    requirePermission(user, 'opportunities:applicants');
    const { applicationId } = ApplicationIdSchema.parse(formToObject(form));
    const application = await loadApplicationForOrg(applicationId);
    requirePermission(user, 'opportunities:applicants', { ownerId: await orgOwners(application.opportunity.organizationId) });
    if (!application.shareProfile) {
      throw conflict('لم يوافق المتقدّم على مشاركة ملفه، فلا تُعرض أي بيانات شخصية عنه.');
    }
    if (application.status === 'WITHDRAWN') throw conflict('سحب المتقدّم طلبه، فلم تعد بياناته متاحة.');

    const row = await db.opportunityApplication.findUniqueOrThrow({
      where: { id: application.id },
      select: {
        message: true,
        applicant: {
          select: {
            fullName: true,
            email: true,
            phone: true,
            youthProfile: {
              select: {
                birthYear: true,
                educationLevel: true,
                languages: true,
                interests: true,
                jobSeeking: true,
                area: { select: { nameAr: true } },
              },
            },
            youthSkills: { orderBy: { skill: { nameAr: 'asc' } }, select: { level: true, skill: { select: { nameAr: true } } } },
          },
        },
      },
    });
    const p = row.applicant.youthProfile;
    const view: ApplicantView = {
      applicationId: application.id,
      fullName: row.applicant.fullName,
      email: row.applicant.email,
      phone: row.applicant.phone,
      birthYear: p?.birthYear ?? null,
      area: p?.area?.nameAr ?? null,
      educationLevel: p?.educationLevel ?? null,
      languages: p?.languages ?? [],
      interests: p?.interests ?? [],
      jobSeeking: p?.jobSeeking ?? false,
      skills: row.applicant.youthSkills.map((s) => ({ name: s.skill.nameAr, level: s.level })),
      message: row.message,
    };

    await db.$transaction(async (tx) => {
      // القيم لا تُنسخ إلى التدقيق — من قرأ، وأي طلب، ولأي فرصة
      await writeAudit(tx, user, 'application.view', 'OpportunityApplication', application.id, null, {
        opportunityId: application.opportunity.id,
        applicantId: application.applicantId,
      });
    });
    return { message: 'سُجّلت قراءتك لبيانات المتقدّم في سجل التدقيق.', data: view };
  });
}
