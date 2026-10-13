import 'server-only';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import type { Prisma } from '@/lib/generated/prisma/client';
import type { IdeaStatus } from '@/lib/generated/prisma/enums';
import { skipTake, type Page } from '@/lib/paging';
import { can, scopeFilter, type SessionUser } from '@/lib/rbac';
import { voteModes, type VoteMode } from './public';
import { IDEA_STATUS_LABELS, nextIdeaStatuses, PUBLIC_IDEA_STATUSES } from './workflow';

// قراءات الأفكار — مشتركة بين صفحات الويب وواجهة الجوّال. كل دالة تفحص صلاحيتها وتختار حقولها بنفسها.

export type PublicIdeaFilter = { status?: string; committee?: string; area?: string; sort?: string };

/** /ideas — D28: من SCREENING فصاعدًا وبلا اسم صاحبها. voteMode محسوب على الخادم لكل فكرة. */
export async function publicIdeas(user: SessionUser | null, filter: PublicIdeaFilter, p: Page) {
  const status = PUBLIC_IDEA_STATUSES.includes(filter.status as IdeaStatus) ? (filter.status as IdeaStatus) : null;
  const where: Prisma.IdeaWhereInput = {
    status: status ?? { in: PUBLIC_IDEA_STATUSES },
    ...(filter.committee ? { committee: { slug: filter.committee } } : {}),
    ...(filter.area ? { areaId: filter.area } : {}),
  };
  const orderBy: Prisma.IdeaOrderByWithRelationInput[] =
    filter.sort === 'new' ? [{ createdAt: 'desc' }] : [{ voteCount: 'desc' }, { createdAt: 'desc' }];

  const [rows, total, committees, areas] = await Promise.all([
    db.idea.findMany({
      where,
      orderBy,
      ...skipTake(p),
      select: {
        id: true,
        reference: true,
        title: true,
        problem: true,
        status: true,
        voteCount: true,
        createdAt: true,
        committee: { select: { nameAr: true } },
        area: { select: { nameAr: true } },
      },
    }),
    db.idea.count({ where }),
    db.committee.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, nameAr: true } }),
    db.area.findMany({ orderBy: { nameAr: 'asc' }, select: { id: true, nameAr: true } }),
  ]);
  const modes = await voteModes(user, rows);
  const items = rows.map((i) => ({ ...i, voteMode: modes.get(i.id) ?? ('closed' as VoteMode) }));
  return { items, total, committees, areas, status, ...p };
}

/**
 * /ideas/[id]. المُستلمة قبل الفرز غير موجودة للعامة، والمدموجة تُحيل إلى الأصلية.
 * ملاحظة المراجعة لا تغادر الخادم إلا لمن يملك ideas:read_internal بنطاق الفكرة.
 */
export async function publicIdea(user: SessionUser | null, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const row = await db.idea.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      title: true,
      problem: true,
      solution: true,
      estimatedCost: true,
      status: true,
      voteCount: true,
      committeeId: true,
      reviewNote: true,
      createdAt: true,
      committee: { select: { nameAr: true, slug: true } },
      area: { select: { nameAr: true } },
      mergedInto: { select: { id: true, reference: true, title: true } },
    },
  });
  if (!row) return null;
  if (row.status === 'MERGED' && row.mergedInto) return { kind: 'merged' as const, mergedInto: row.mergedInto };
  if (!PUBLIC_IDEA_STATUSES.includes(row.status)) return null;

  const internal = can(user, 'ideas:read_internal', { committeeId: row.committeeId });
  const voteMode = (await voteModes(user, [row])).get(row.id) ?? ('closed' as VoteMode);
  const idea = {
    id: row.id,
    reference: row.reference,
    title: row.title,
    problem: row.problem,
    solution: row.solution,
    estimatedCost: row.estimatedCost,
    status: row.status,
    voteCount: row.voteCount,
    createdAt: row.createdAt,
    committee: row.committee,
    area: row.area,
    reviewNote: internal ? row.reviewNote : null,
  };
  return { kind: 'idea' as const, idea, voteMode, internal };
}

/** «أفكاري» — ما قدّمه باسمه بكل حالاته، وملاحظة المراجعة له (طلب تعديل) */
export async function myIdeas(user: SessionUser) {
  requirePermission(user, 'ideas:create');
  return db.idea.findMany({
    where: { submitterId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      reference: true,
      title: true,
      problem: true,
      solution: true,
      estimatedCost: true,
      status: true,
      voteCount: true,
      reviewNote: true,
      createdAt: true,
      committee: { select: { nameAr: true } },
      mergedInto: { select: { id: true, reference: true } },
    },
  });
}

export const REVIEW_STATUSES = Object.keys(IDEA_STATUS_LABELS) as IdeaStatus[];

/** /admin/ideas — بنطاق ideas:review. الافتراضي: ما ينتظر عملًا. null ⇒ لا نطاق. */
export async function ideaReviewList(user: SessionUser, rawStatus: string | undefined, p: Page) {
  requirePermission(user, 'ideas:review');
  const scope = scopeFilter(user, 'ideas:review');
  if (!scope) return null;
  const status = REVIEW_STATUSES.includes(rawStatus as IdeaStatus) ? (rawStatus as IdeaStatus) : null;
  const statusWhere: Prisma.IdeaWhereInput['status'] = status ?? { in: ['SUBMITTED', 'SCREENING', 'COMMITTEE_REVIEW'] };
  const where: Prisma.IdeaWhereInput = {
    status: statusWhere,
    ...(scope.all ? {} : { committeeId: { in: scope.committees } }),
  };
  const [items, total] = await Promise.all([
    db.idea.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }],
      ...skipTake(p),
      select: {
        id: true,
        reference: true,
        title: true,
        status: true,
        voteCount: true,
        createdAt: true,
        committee: { select: { nameAr: true } },
      },
    }),
    db.idea.count({ where }),
  ]);
  return { items, total, status, ...p };
}

/** ما يُعرض في لوحة المراجعة — جدول §5.2 + can() بنطاق الفكرة. الخادم يفحص من جديد عند كل إجراء. */
export type IdeaActions = {
  screen: boolean;
  toCommittee: { committees: { id: string; nameAr: string }[] } | null;
  requestChanges: boolean;
  merge: boolean;
  decide: boolean;
};

/** /admin/ideas/[id] — فكرة خارج نطاقه = null (رئيس لجنة لا يرى لجنة غيره) */
export async function ideaReviewFile(user: SessionUser, id: string) {
  requirePermission(user, 'ideas:review');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const idea = await db.idea.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      title: true,
      problem: true,
      solution: true,
      estimatedCost: true,
      status: true,
      voteCount: true,
      committeeId: true,
      reviewNote: true,
      decidedAt: true,
      createdAt: true,
      committee: { select: { nameAr: true } },
      area: { select: { nameAr: true } },
      decidedBy: { select: { fullName: true } },
      mergedInto: { select: { reference: true, id: true } },
      mergedFrom: { select: { reference: true, id: true, title: true } },
    },
  });
  if (!idea || !can(user, 'ideas:review', { committeeId: idea.committeeId })) return null;

  const ctx = { committeeId: idea.committeeId };
  const reviewNext = nextIdeaStatuses(idea.status, 'ideas:review');
  const actions: IdeaActions = {
    screen: reviewNext.includes('SCREENING'),
    toCommittee: reviewNext.includes('COMMITTEE_REVIEW')
      ? {
          committees: await db.committee.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select: { id: true, nameAr: true },
          }),
        }
      : null,
    requestChanges: reviewNext.includes('CHANGES_REQUESTED'),
    merge: can(user, 'ideas:merge', ctx) && nextIdeaStatuses(idea.status, 'ideas:merge').length > 0,
    decide: can(user, 'ideas:approve', ctx) && nextIdeaStatuses(idea.status, 'ideas:approve').length > 0,
  };
  return { idea, actions };
}

export type DemandMode = 'can' | 'login' | 'closed';

/** /demand — الاستطلاعات المفتوحة، واختيار المستخدم في كل منها، وحالة التصويت */
export async function openDemandPolls(user: SessionUser | null) {
  const now = new Date();
  const rows = await db.demandPoll.findMany({
    where: { isActive: true, OR: [{ closesAt: null }, { closesAt: { gt: now } }] },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      description: true,
      proposalThreshold: true,
      closesAt: true,
      options: { orderBy: { sortOrder: 'asc' }, select: { id: true, label: true, voteCount: true } },
    },
  });
  const mine = user
    ? new Map(
        (await db.demandVote.findMany({ where: { userId: user.id, pollId: { in: rows.map((p) => p.id) } } })).map((v) => [
          v.pollId,
          v.optionId,
        ]),
      )
    : new Map<string, string>();
  const mode: DemandMode = !user ? 'login' : can(user, 'demand:vote') ? 'can' : 'closed';
  return { mode, polls: rows.map((p) => ({ ...p, myOptionId: mine.get(p.id) ?? null })) };
}
