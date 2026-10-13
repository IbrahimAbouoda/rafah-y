import 'server-only';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { forbidden } from '@/lib/errors';
import type { Prisma } from '@/lib/generated/prisma/client';
import type { InitiativeStatus } from '@/lib/generated/prisma/enums';
import { can, scopeFilter, type SessionUser } from '@/lib/rbac';
import { INITIATIVE_STATUS_LABELS, INITIATIVE_TRANSITIONS, securedTotals } from './workflow';

// /admin/initiatives وتبويباته (D30) وملف المبادرة — مشتركة بين صفحات الويب وواجهة الجوّال.

/** تبويبات /admin/initiatives — كل تبويب بصلاحيته */
export const INITIATIVE_TABS = [
  { key: 'list', label: 'المبادرات', permission: 'initiatives:update' },
  { key: 'demand', label: 'استطلاعات الطلب', permission: 'demand:manage' },
  { key: 'notes', label: 'مسودات Concept Note', permission: 'concept_notes:approve' },
] as const;

export function initiativeTabsFor(user: SessionUser) {
  return INITIATIVE_TABS.filter((t) => can(user, t.permission));
}

/** تبويب المبادرات: مبادرات لجانه، وما يلزم نموذج الإنشاء (لجان وأفكار معتمدة بلا مبادرة) لمن يملك initiatives:create */
export async function initiativeAdminList(user: SessionUser) {
  requirePermission(user, 'initiatives:update');
  const scope = scopeFilter(user, 'initiatives:update');
  const where: Prisma.InitiativeWhereInput = scope?.all ? {} : { committeeId: { in: scope?.committees ?? [] } };
  const createScope = scopeFilter(user, 'initiatives:create');
  const [rows, committees, ideas] = await Promise.all([
    db.initiative.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        progressPct: true,
        updatedAt: true,
        committee: { select: { nameAr: true } },
        _count: { select: { offers: { where: { status: 'SUBMITTED' } } } },
      },
    }),
    createScope
      ? db.committee.findMany({
          where: { isActive: true, ...(createScope.all ? {} : { id: { in: createScope.committees } }) },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, nameAr: true },
        })
      : [],
    createScope
      ? db.idea.findMany({
          where: { status: 'APPROVED', initiativeId: null, ...(createScope.all ? {} : { committeeId: { in: createScope.committees } }) },
          select: { id: true, reference: true, title: true },
        })
      : [],
  ]);
  return { rows, create: createScope ? { committees, ideas } : null };
}

/** تبويب الطلب (demand:manage): كل الاستطلاعات بخياراتها وحالة مسودة كل خيار */
export async function demandAdmin(user: SessionUser) {
  requirePermission(user, 'demand:manage');
  const [polls, initiatives] = await Promise.all([
    db.demandPoll.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        isActive: true,
        proposalThreshold: true,
        closesAt: true,
        options: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, label: true, voteCount: true, conceptNote: { select: { status: true } } },
        },
        _count: { select: { votes: true } },
      },
    }),
    db.initiative.findMany({ where: { status: { notIn: ['CANCELLED', 'COMPLETED'] } }, select: { id: true, title: true } }),
  ]);
  return { polls, initiatives };
}

/** تبويب Concept Note (concept_notes:approve) — الإرسال لا يتم إلا بعد اعتماد بشري مسجّل */
export async function conceptNotes(user: SessionUser) {
  requirePermission(user, 'concept_notes:approve');
  return db.conceptNote.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      bodyMd: true,
      status: true,
      voterCount: true,
      approvedAt: true,
      sentAt: true,
      createdAt: true,
      approvedBy: { select: { fullName: true } },
      demandOption: { select: { label: true, poll: { select: { title: true } } } },
    },
  });
}

export type InitiativeTransitionButton = {
  to: InitiativeStatus;
  label: string;
  variant: 'default' | 'outline' | 'destructive';
};

/** ملف المبادرة الداخلي — مبادرة لجنة غيره = null. الأزرار والصلاحيات محسوبة هنا بنطاق لجنتها. */
export async function initiativeFile(user: SessionUser, id: string) {
  requirePermission(user, 'initiatives:update');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const initiative = await db.initiative.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      description: true,
      status: true,
      committeeId: true,
      estimatedBudget: true,
      beneficiariesTarget: true,
      beneficiariesReached: true,
      impactSummary: true,
      progressPct: true,
      startsAt: true,
      endsAt: true,
      approvedAt: true,
      approvedBy: { select: { fullName: true } },
      committee: { select: { nameAr: true } },
      needs: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, type: true, description: true, quantity: true, unit: true, amount: true, status: true, sortOrder: true },
      },
      offers: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          types: true,
          amount: true,
          currency: true,
          note: true,
          status: true,
          decisionNote: true,
          createdAt: true,
          organization: { select: { name: true } },
          need: { select: { description: true } },
          _count: { select: { fundingRecords: true } },
        },
      },
      partners: { select: { role: true, since: true, organization: { select: { id: true, name: true } } } },
      updates: {
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, body: true, isPublic: true, createdAt: true, author: { select: { fullName: true } } },
      },
      fundingRecords: { select: { direction: true, amount: true, currency: true, approvedAt: true } },
    },
  });
  if (!initiative || !can(user, 'initiatives:update', { committeeId: initiative.committeeId })) return null;

  const ctx = { committeeId: initiative.committeeId };
  const transitions: InitiativeTransitionButton[] = INITIATIVE_TRANSITIONS[initiative.status]
    .filter((t) => can(user, t.permission, ctx))
    .map((t) => ({
      to: t.to,
      label:
        t.to === 'PUBLISHED'
          ? 'اعتماد ونشر'
          : t.to === 'PENDING_APPROVAL'
            ? 'إرسال لاعتماد الرئيس'
            : t.to === 'DRAFT'
              ? 'إعادة للتعديل'
              : `نقل إلى «${INITIATIVE_STATUS_LABELS[t.to]}»`,
      variant: t.to === 'CANCELLED' ? 'destructive' : t.to === 'PUBLISHED' ? 'default' : 'outline',
    }));
  return {
    initiative,
    secured: securedTotals(initiative.fundingRecords),
    closed: initiative.status === 'COMPLETED' || initiative.status === 'CANCELLED',
    can: {
      manageNeeds: can(user, 'initiatives:manage_needs', ctx),
      decideOffers: can(user, 'offers:decide', ctx),
      postUpdate: can(user, 'initiatives:post_update', ctx),
    },
    transitions,
  };
}

/** يرفض تبويبًا لا يملك صلاحيته — للجوّال (الويب يخفي التبويب من الأساس) */
export function requireTab(user: SessionUser, key: (typeof INITIATIVE_TABS)[number]['key']) {
  const tab = INITIATIVE_TABS.find((t) => t.key === key)!;
  if (!can(user, tab.permission)) throw forbidden();
}
