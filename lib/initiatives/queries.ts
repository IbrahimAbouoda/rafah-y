import 'server-only';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { memberOrganizationIds } from '@/lib/organizations';
import { scopeFilter, type SessionUser } from '@/lib/rbac';
import {
  OFFERABLE_INITIATIVE_STATUSES,
  OPEN_NEED_STATUSES,
  PUBLIC_INITIATIVE_STATUSES,
  securedTotals,
} from './workflow';

// قراءات المبادرات وبوابة المؤسسات — مشتركة بين صفحات الويب وواجهة الجوّال.

/** /initiatives — المنشورة فقط، مع عدد الاحتياجات المفتوحة والشركاء والمبلغ المؤمَّن لكل عملة */
export async function publicInitiatives() {
  const rows = await db.initiative.findMany({
    where: { status: { in: PUBLIC_INITIATIVE_STATUSES } },
    orderBy: [{ isFlagship: 'desc' }, { approvedAt: 'desc' }],
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      status: true,
      progressPct: true,
      committee: { select: { nameAr: true } },
      _count: { select: { needs: { where: { status: { in: OPEN_NEED_STATUSES } } }, partners: true } },
    },
  });
  const secured = await securedByInitiative(rows.map((i) => i.id));
  return rows.map((i) => ({ ...i, secured: secured.get(i.id) ?? {} }));
}

/** /initiatives/[slug] — غير المعتمدة = null (AC-09: لا تظهر للعامة) */
export async function publicInitiative(slug: string) {
  const initiative = await db.initiative.findFirst({
    where: { slug, status: { in: PUBLIC_INITIATIVE_STATUSES } },
    select: {
      id: true,
      title: true,
      summary: true,
      description: true,
      status: true,
      progressPct: true,
      estimatedBudget: true,
      beneficiariesTarget: true,
      beneficiariesReached: true,
      impactSummary: true,
      startsAt: true,
      endsAt: true,
      committee: { select: { nameAr: true, slug: true } },
      needs: {
        where: { status: { not: 'CANCELLED' } },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, type: true, description: true, quantity: true, unit: true, amount: true, status: true },
      },
      partners: { orderBy: { since: 'asc' }, select: { role: true, organization: { select: { name: true } } } },
      updates: {
        where: { isPublic: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, body: true, createdAt: true },
      },
    },
  });
  if (!initiative) return null;
  return { ...initiative, secured: (await securedByInitiative([initiative.id])).get(initiative.id) ?? {} };
}

/** /support «ادعمنا» — الاحتياجات المفتوحة في المبادرات التي تقبل عروضًا */
export async function openNeeds() {
  return db.initiativeNeed.findMany({
    where: { status: { in: OPEN_NEED_STATUSES }, initiative: { status: { in: OFFERABLE_INITIATIVE_STATUSES } } },
    orderBy: [{ initiative: { isFlagship: 'desc' } }, { createdAt: 'asc' }],
    take: 100,
    select: {
      id: true,
      type: true,
      description: true,
      quantity: true,
      unit: true,
      amount: true,
      status: true,
      initiative: { select: { slug: true, title: true } },
    },
  });
}

/** /partner — مؤسسات المستخدم وعدّادات عروضها (D27: «خاص» = مؤسساته) */
export async function partnerHome(user: SessionUser) {
  requirePermission(user, 'offers:create');
  const orgIds = await memberOrganizationIds(db, user.id);
  const [orgs, pending, accepted, openNeedCount] = await Promise.all([
    db.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true, stage: true } }),
    db.supportOffer.count({ where: { organizationId: { in: orgIds }, status: 'SUBMITTED' } }),
    db.supportOffer.count({ where: { organizationId: { in: orgIds }, status: 'ACCEPTED' } }),
    db.initiativeNeed.count({
      where: { status: { in: OPEN_NEED_STATUSES }, initiative: { status: { in: OFFERABLE_INITIATIVE_STATUSES } } },
    }),
  ]);
  return { orgs, pending, accepted, openNeeds: openNeedCount };
}

/** /partner/needs — مؤسساته (لاختيار المؤسسة المقدِّمة) والمبادرات ذات الاحتياجات المفتوحة */
export async function partnerNeeds(user: SessionUser) {
  requirePermission(user, 'offers:create');
  const orgIds = await memberOrganizationIds(db, user.id);
  const [orgs, initiatives] = await Promise.all([
    db.organization.findMany({ where: { id: { in: orgIds } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.initiative.findMany({
      where: { status: { in: OFFERABLE_INITIATIVE_STATUSES }, needs: { some: { status: { in: OPEN_NEED_STATUSES } } } },
      orderBy: [{ isFlagship: 'desc' }, { approvedAt: 'desc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        committee: { select: { nameAr: true } },
        needs: {
          where: { status: { in: OPEN_NEED_STATUSES } },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, type: true, description: true, quantity: true, unit: true, amount: true, status: true },
        },
      },
    }),
  ]);
  return { orgs, initiatives };
}

/** /partner/offers — حتى من يملك نطاقًا أوسع يرى هنا عروض مؤسساته فقط: هذه بوابته هو */
export async function partnerOffers(user: SessionUser) {
  requirePermission(user, 'offers:read');
  const scope = scopeFilter(user, 'offers:read');
  const orgIds = await memberOrganizationIds(db, user.id);
  return db.supportOffer.findMany({
    where: { organizationId: { in: scope ? orgIds : [] } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      types: true,
      amount: true,
      currency: true,
      status: true,
      decisionNote: true,
      createdAt: true,
      organization: { select: { name: true } },
      initiative: { select: { slug: true, title: true } },
      need: { select: { description: true } },
    },
  });
}

/** المبلغ المؤمَّن لكل مبادرة — من القيود الواردة المعتمدة فقط (§5.3) */
export async function securedByInitiative(initiativeIds: string[]): Promise<Map<string, Record<string, string>>> {
  if (initiativeIds.length === 0) return new Map();
  const rows = await db.fundingRecord.findMany({
    where: { initiativeId: { in: initiativeIds }, direction: 'INCOMING', approvedAt: { not: null } },
    select: { initiativeId: true, direction: true, amount: true, currency: true, approvedAt: true },
  });
  const grouped = new Map<string, typeof rows>();
  for (const r of rows) grouped.set(r.initiativeId!, [...(grouped.get(r.initiativeId!) ?? []), r]);
  return new Map(initiativeIds.map((id) => [id, securedTotals(grouped.get(id) ?? [])]));
}
