import 'server-only';
import { writeAudit } from '@/lib/audit';
import { DEMO_ACCOUNT_EMAIL } from '@/lib/config';
import type { Db, Tx } from '@/lib/db';
import { isReferencedError } from '@/lib/db-errors';
import { conflict, forbidden } from '@/lib/errors';
import { can, type SessionUser } from '@/lib/rbac';

// AC-20 · M10 — بيانات العرض تحمل isDemo على ستة نماذج فقط (PRD §4.1) وتُحذف كلها قبل الإطلاق،
// ومعها حساب العرض المعطّل صاحبها (DEMO_ACCOUNT_EMAIL). المشغّلان: purgeDemoDataAction و npm run admin:purge-demo.

export type DemoCounts = {
  complaints: number;
  ideas: number;
  initiatives: number;
  organizations: number;
  opportunities: number;
  activities: number;
};

/** `deletedAt: undefined` يوقف مرشّح الحذف الناعم في lib/db.ts: المحذوف ناعمًا بيانات عرض أيضًا */
const DEMO = { isDemo: true, deletedAt: undefined };
const DEMO_ACCOUNT = { email: DEMO_ACCOUNT_EMAIL, deletedAt: undefined };

export async function countDemoData(client: Db | Tx): Promise<DemoCounts> {
  const [complaints, ideas, initiatives, organizations, opportunities, activities] = await Promise.all([
    client.complaint.count({ where: DEMO }),
    client.idea.count({ where: DEMO }),
    client.initiative.count({ where: DEMO }),
    client.organization.count({ where: DEMO }),
    client.opportunity.count({ where: DEMO }),
    client.activity.count({ where: DEMO }),
  ]);
  return { complaints, ideas, initiatives, organizations, opportunities, activities };
}

export const demoTotal = (c: DemoCounts) => Object.values(c).reduce((a, b) => a + b, 0);

/** ما سيُحذف: النماذج الستة وحساب العرض إن وُجد */
export async function demoSnapshot(client: Db | Tx) {
  const [counts, demoAccount] = await Promise.all([countDemoData(client), client.user.count({ where: DEMO_ACCOUNT })]);
  return { ...counts, demoAccount };
}

/**
 * حذف فعلي (لا ناعم) داخل معاملة المستدعي. القاعدة:
 * - ما لا يوجد إلا بسجل عرض (ارتباطه به إلزامي) يُحذف معه: ما عليه CASCADE تحذفه القاعدة،
 *   وما عليه RESTRICT يُحذف هنا أولًا — عروض الدعم، الشراكات، الاتفاقيات، طلبات الفرص، تسجيلات الأنشطة.
 * - السجل الحقيقي المرتبط اختياريًا بسجل عرض (مهمة، ملف، قيد تمويل، بند جدول أعمال) يبقى، وتُفرغ القاعدة
 *   الرابط (SET NULL).
 * - حساب العرض يُحذف آخرًا، بعد كل ما أنشأه. إن ربطته سجلات حقيقية تُلغى العملية كلها.
 */
export async function purgeDemoData(tx: Tx) {
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
  const select = { id: true } as const;
  const complaints = ids(await tx.complaint.findMany({ where: DEMO, select }));
  const ideas = ids(await tx.idea.findMany({ where: DEMO, select }));
  const initiatives = ids(await tx.initiative.findMany({ where: DEMO, select }));
  const organizations = ids(await tx.organization.findMany({ where: DEMO, select }));
  const opportunities = ids(await tx.opportunity.findMany({ where: DEMO, select }));
  const activities = ids(await tx.activity.findMany({ where: DEMO, select }));

  const dependents = {
    supportOffers: (
      await tx.supportOffer.deleteMany({
        where: { OR: [{ initiativeId: { in: initiatives } }, { organizationId: { in: organizations } }] },
      })
    ).count,
    initiativePartners: (await tx.initiativePartner.deleteMany({ where: { organizationId: { in: organizations } } })).count,
    agreements: (await tx.agreement.deleteMany({ where: { organizationId: { in: organizations } } })).count,
    activityPartners: (await tx.activityPartner.deleteMany({ where: { organizationId: { in: organizations } } })).count,
    opportunityApplications: (await tx.opportunityApplication.deleteMany({ where: { opportunityId: { in: opportunities } } }))
      .count,
    activityRegistrations: (await tx.activityRegistration.deleteMany({ where: { activityId: { in: activities } } })).count,
  };

  const byId = (list: string[]) => ({ id: { in: list } });
  const deleted: DemoCounts = {
    complaints: (await tx.complaint.deleteMany({ where: byId(complaints) })).count,
    ideas: (await tx.idea.deleteMany({ where: byId(ideas) })).count,
    initiatives: (await tx.initiative.deleteMany({ where: byId(initiatives) })).count,
    opportunities: (await tx.opportunity.deleteMany({ where: byId(opportunities) })).count,
    activities: (await tx.activity.deleteMany({ where: byId(activities) })).count,
    // آخرًا: المؤسسة يشير إليها ما سبق
    organizations: (await tx.organization.deleteMany({ where: byId(organizations) })).count,
  };

  let demoAccount = 0;
  try {
    demoAccount = (await tx.user.deleteMany({ where: DEMO_ACCOUNT })).count;
  } catch (e) {
    if (!isReferencedError(e)) throw e;
    throw conflict(
      `حساب العرض ${DEMO_ACCOUNT_EMAIL} مرتبط بسجلات ليست بيانات عرض، فأُلغي الحذف كله ولم يُحذف شيء. راجع سجلاته مع المدير التقني ثم أعد المحاولة.`,
    );
  }
  return { deleted, dependents, demoAccount };
}

/**
 * الأمر كاملًا: الصلاحية ← معاملة واحدة (حذف + سطر settings.change بالأعداد قبل وبعد).
 * يعيد عدد ما حُذف، وصفرًا بلا سطر تدقيق إن لم يوجد شيء. التأكيد الصريح يتحقق منه المستدعي.
 */
export async function runDemoPurge(client: Db, actor: SessionUser, opts: { source?: string } = {}) {
  if (!can(actor, 'settings:manage')) throw forbidden();
  return client.$transaction(async (tx) => {
    const before = await demoSnapshot(tx);
    const { demoAccount, ...counts } = before;
    if (demoTotal(counts) + demoAccount === 0) return 0;
    const result = await purgeDemoData(tx);
    await writeAudit(tx, actor, 'settings.change', 'DemoData', 'purge', before, { ...result, source: opts.source ?? 'app' });
    return demoTotal(result.deleted) + result.demoAccount;
  });
}
