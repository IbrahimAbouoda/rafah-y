import 'server-only';
import { committeeMembers, readableCommitteesWhere } from '@/lib/committees';
import { OPEN_STATUSES } from '@/lib/complaints/workflow';
import { db } from '@/lib/db';
import { forbidden } from '@/lib/errors';
import { can, canBeyondOwn, type SessionUser } from '@/lib/rbac';
import { boardTasks } from '@/lib/tasks/board';

// اللجان ولوحاتها ومهامها — مشتركة بين صفحات الويب وواجهة الجوّال.

/** /committees — اللجان النشطة بولايتها. Q15 مفتوح: بلا أسماء أعضاء */
export async function publicCommittees() {
  return db.committee.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { slug: true, nameAr: true, mandate: true },
  });
}

/** /committees/[slug] — عدد ما حُلّ وأبرز أفكارها قيد الدراسة والمعتمدة */
export async function publicCommittee(slug: string) {
  const committee = await db.committee.findFirst({
    where: { slug, isActive: true },
    select: { id: true, nameAr: true, mandate: true },
  });
  if (!committee) return null;
  const [resolved, ideas] = await Promise.all([
    db.complaint.count({ where: { committeeId: committee.id, status: { in: ['RESOLVED', 'CLOSED'] } } }),
    db.idea.findMany({
      where: { committeeId: committee.id, status: { in: ['COMMITTEE_REVIEW', 'APPROVED'] } },
      orderBy: { voteCount: 'desc' },
      take: 10,
      select: { id: true, title: true, status: true, voteCount: true },
    }),
  ]);
  return { committee: { nameAr: committee.nameAr, mandate: committee.mandate }, resolved, ideas };
}

/** /admin/committees — لجانه (أو الكل) بعدّاد الشكاوى المفتوحة والمهام غير المنجزة */
export async function committeeList(user: SessionUser) {
  if (!canBeyondOwn(user, 'committees:read')) throw forbidden();
  const where = readableCommitteesWhere(user);
  if (!where) return null;
  return db.committee.findMany({
    where: { ...where, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      slug: true,
      nameAr: true,
      mandate: true,
      _count: {
        select: {
          complaints: { where: { status: { in: OPEN_STATUSES } } },
          tasks: { where: { status: { not: 'DONE' } } },
        },
      },
    },
  });
}

/** /admin/committees/[slug] — لوحة اللجنة. لجنة غيره = null. كل قسم null إن لم يملك صلاحيته بنطاقها. */
export async function committeeDashboard(user: SessionUser, slug: string) {
  if (!canBeyondOwn(user, 'committees:read')) throw forbidden();
  const committee = await db.committee.findUnique({ where: { slug }, select: { id: true, slug: true, nameAr: true, mandate: true } });
  // لجنة غيره = غير موجودة، فلا يكشف التخمين وجودها (معيار Sprint 2)
  if (!committee || !can(user, 'committees:read', { committeeId: committee.id })) return null;

  const today = new Date(new Date().setHours(0, 0, 0, 0));
  const ctx = { committeeId: committee.id };
  const readComplaints = can(user, 'complaints:read', ctx);
  const readTasks = can(user, 'tasks:read', ctx);
  const readIdeas = can(user, 'ideas:read_internal', ctx);
  const openWhere = { committeeId: committee.id, status: { in: OPEN_STATUSES } };

  const [complaints, openCount, overdue, tasksInReview, openTasks, ideas, members] = await Promise.all([
    readComplaints
      ? db.complaint.findMany({
          where: openWhere,
          orderBy: [{ followUpAt: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'asc' }],
          take: 50,
          select: { id: true, reference: true, title: true, status: true, followUpAt: true, updatedAt: true },
        })
      : null,
    readComplaints ? db.complaint.count({ where: openWhere }) : null,
    readComplaints ? db.complaint.count({ where: { ...openWhere, followUpAt: { lt: today } } }) : null,
    readTasks ? db.task.count({ where: { committeeId: committee.id, status: 'REVIEW' } }) : null,
    readTasks ? db.task.count({ where: { committeeId: committee.id, status: { not: 'DONE' } } }) : null,
    readIdeas
      ? db.idea.findMany({
          where: { committeeId: committee.id, status: { in: ['COMMITTEE_REVIEW', 'CHANGES_REQUESTED'] } },
          orderBy: { voteCount: 'desc' },
          take: 20,
          select: { id: true, reference: true, title: true, status: true, voteCount: true },
        })
      : null,
    committeeMembers(db, committee.id),
  ]);
  return {
    committee,
    can: { readComplaints, readTasks, readIdeas },
    complaints,
    openCount,
    overdue,
    tasksInReview,
    openTasks,
    ideas,
    members,
  };
}

/** /admin/committees/[slug]/tasks — لوحة كانبان اللجنة، وأعضاؤها لنموذج إنشاء المهمة */
export async function committeeBoard(user: SessionUser, slug: string) {
  if (!canBeyondOwn(user, 'tasks:read')) throw forbidden();
  const committee = await db.committee.findUnique({ where: { slug }, select: { id: true, slug: true, nameAr: true } });
  if (!committee || !can(user, 'tasks:read', { committeeId: committee.id })) return null;
  const canCreate = can(user, 'tasks:create', { committeeId: committee.id });
  const [tasks, members] = await Promise.all([
    boardTasks(user, { committeeId: committee.id }),
    canCreate ? committeeMembers(db, committee.id) : [],
  ]);
  return { committee, tasks, members, canCreate };
}

/** /admin/tasks «مهامي» — المسندة إليه في كل لجانه */
export async function myTasks(user: SessionUser) {
  if (!can(user, 'tasks:read')) throw forbidden();
  return boardTasks(user, { assigneeId: user.id });
}
