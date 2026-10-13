import 'server-only';
import { requirePermission } from '@/lib/auth';
import { committeeMembers } from '@/lib/committees';
import { nextStatuses, OPEN_STATUSES } from '@/lib/complaints/workflow';
import { db } from '@/lib/db';
import { forbidden } from '@/lib/errors';
import type { Prisma } from '@/lib/generated/prisma/client';
import type { ComplaintStatus } from '@/lib/generated/prisma/enums';
import { skipTake, type Page } from '@/lib/paging';
import { can, canBeyondOwn, scopeFilter, type SessionUser } from '@/lib/rbac';
import { COMPLAINT_STATUSES } from '@/lib/validation/complaints';

/**
 * شرط الشكاوى التي يحق للمستخدم رؤيتها بـ complaints:read — يُضاف إلى كل استعلام قائمة أو عدّاد
 * (StatTile: «المؤشر لا يُحسب إلا من بيانات يحق للمستخدم رؤيتها»). null ⇒ لا شيء.
 */
export function readableComplaints(user: SessionUser): Prisma.ComplaintWhereInput | null {
  const scope = scopeFilter(user, 'complaints:read');
  if (!scope) return null;
  if (scope.all) return {};
  const or: Prisma.ComplaintWhereInput[] = [];
  if (scope.committees.length > 0) or.push({ committeeId: { in: scope.committees } });
  if (scope.own) or.push({ submitterId: user.id });
  return or.length > 0 ? { OR: or } : null;
}

// ─── قراءات مشتركة بين صفحات الويب وواجهة الجوّال ─────────────────────────────
// كل دالة تفحص صلاحيتها بنفسها (دفاع في العمق): الصفحة تمرّ قبلها بـ guardPage، والمسار بـ apiRoute.

/** شاشات المجلس (/admin/complaints) — مثل guardPage(…, { beyondOwn: true }) لكن داخل الدالة نفسها */
function requireBeyondOwn(user: SessionUser) {
  if (!canBeyondOwn(user, 'complaints:read')) throw forbidden();
}

/** «شكاواي»: ما قدّمه باسمه فقط — حتى من يملك نطاق «الكل» لا يرى هنا إلا شكاواه */
export async function myComplaints(user: SessionUser, p: Page) {
  requirePermission(user, 'complaints:read');
  const where = { submitterId: user.id };
  const [items, total] = await Promise.all([
    db.complaint.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...skipTake(p),
      select: {
        id: true,
        reference: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        committee: { select: { nameAr: true } },
      },
    }),
    db.complaint.count({ where }),
  ]);
  return { items, total, ...p };
}

/** شكوى من «شكاواي» بأحداثها العامة. شكوى غيره = null (غير موجودة، لا «ممنوعة» تكشف وجودها). */
export async function myComplaint(user: SessionUser, reference: string) {
  requirePermission(user, 'complaints:read');
  const complaint = await db.complaint.findFirst({
    where: { reference: reference.toUpperCase(), submitterId: user.id },
    select: {
      reference: true,
      title: true,
      body: true,
      status: true,
      submitterId: true,
      createdAt: true,
      category: { select: { nameAr: true } },
      area: { select: { nameAr: true } },
      committee: { select: { nameAr: true } },
      events: {
        where: { isPublic: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, toStatus: true, note: true, createdAt: true },
      },
    },
  });
  if (!complaint || !can(user, 'complaints:read', { ownerId: complaint.submitterId })) return null;
  return complaint;
}

/** عدّادات لوحة الشاب — شكاواه باسمه؛ المجهولة غير مربوطة بحسابه أصلًا (§6.7) */
export async function myComplaintCounts(userId: string) {
  const [open, resolved] = await Promise.all([
    db.complaint.count({ where: { submitterId: userId, status: { in: OPEN_STATUSES } } }),
    db.complaint.count({ where: { submitterId: userId, status: { in: ['RESOLVED', 'CLOSED'] } } }),
  ]);
  return { open, resolved };
}

export type ComplaintListFilter = { q?: string; status?: string; committee?: string };

/** قائمة الشكاوى بنطاق complaints:read — null ⇒ لا نطاق له */
export async function complaintList(user: SessionUser, filter: ComplaintListFilter, p: Page) {
  requireBeyondOwn(user);
  const scope = readableComplaints(user);
  if (!scope) return null;
  const q = filter.q?.trim() ?? '';
  const status = filter.status ?? '';
  const filters: Prisma.ComplaintWhereInput[] = [scope];
  if (status === 'open') filters.push({ status: { in: OPEN_STATUSES } });
  else if ((COMPLAINT_STATUSES as readonly string[]).includes(status)) {
    filters.push({ status: status as ComplaintStatus });
  }
  if (filter.committee) filters.push({ committeeId: filter.committee });
  if (q) {
    filters.push({ OR: [{ reference: { contains: q.toUpperCase() } }, { title: { contains: q, mode: 'insensitive' } }] });
  }
  const where: Prisma.ComplaintWhereInput = { AND: filters };

  // قائمة اللجان في الفلتر: لجانه فقط ما لم يملك نطاق «الكل»
  const readable = scopeFilter(user, 'complaints:read');
  const [items, total, committees] = await Promise.all([
    db.complaint.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      ...skipTake(p),
      select: {
        id: true,
        reference: true,
        title: true,
        status: true,
        updatedAt: true,
        committee: { select: { nameAr: true } },
        category: { select: { nameAr: true } },
        area: { select: { nameAr: true } },
      },
    }),
    db.complaint.count({ where }),
    db.committee.findMany({
      where: readable?.all ? {} : { id: { in: readable?.committees ?? [] } },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, nameAr: true },
    }),
  ]);
  return { items, total, committees, ...p };
}

/** الإجراءات المتاحة لهذا المستخدم على هذه الشكوى الآن — من جدول الانتقالات و can() بنطاقها */
export type ComplaintActions = {
  openForTriage: boolean;
  assign: { committees: { id: string; nameAr: string }[]; suggestedId: string | null } | null;
  dismiss: boolean;
  close: boolean;
  updateStatus: ComplaintStatus[];
  refer: boolean;
  awaitingResponse: boolean;
};

/** ملف الشكوى الداخلي. بيانات التواصل غير مُختارة هنا إطلاقًا — تُطلب بـ readContact وحدها (§6.6). */
export async function complaintFile(user: SessionUser, id: string) {
  // الملف الداخلي فيه أحداث غير عامة وأسماء المنفّذين: لصاحب نطاق لجنة أو «الكل» فقط، لا لمقدّم الشكوى
  requireBeyondOwn(user);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const complaint = await db.complaint.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      title: true,
      body: true,
      status: true,
      isAnonymous: true,
      submitterId: true,
      committeeId: true,
      dismissReason: true,
      resolutionNote: true,
      closedAt: true,
      followUpAt: true,
      createdAt: true,
      category: { select: { nameAr: true, defaultCommitteeId: true } },
      area: { select: { nameAr: true } },
      committee: { select: { nameAr: true } },
      contact: { select: { id: true } },
      events: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, toStatus: true, note: true, isPublic: true, createdAt: true, actor: { select: { fullName: true } } },
      },
      referrals: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          target: true,
          targetName: true,
          note: true,
          followUpAt: true,
          respondedAt: true,
          response: true,
          createdAt: true,
        },
      },
      tasks: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, title: true, status: true, dueAt: true, assignee: { select: { fullName: true } } },
      },
      files: {
        where: { scan: { in: ['PENDING', 'CLEAN'] } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, mimeType: true, sizeBytes: true, scan: true, createdAt: true },
      },
    },
  });
  // شكوى خارج نطاقه = غير موجودة، فلا يكشف التخمين وجودها (AC-04 ①)
  if (!complaint || !can(user, 'complaints:read', { committeeId: complaint.committeeId, ownerId: complaint.submitterId })) {
    return null;
  }

  const ctx = { committeeId: complaint.committeeId };
  const triage = can(user, 'complaints:triage', ctx);
  const closeable = can(user, 'complaints:close', ctx) ? nextStatuses(complaint.status, 'complaints:close') : [];
  const assignTargets = triage && nextStatuses(complaint.status, 'complaints:triage').includes('ASSIGNED');
  const actions: ComplaintActions = {
    openForTriage: triage && nextStatuses(complaint.status, 'complaints:triage').includes('UNDER_REVIEW'),
    assign: assignTargets
      ? {
          committees: await db.committee.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select: { id: true, nameAr: true },
          }),
          suggestedId: complaint.category?.defaultCommitteeId ?? null,
        }
      : null,
    dismiss: closeable.includes('DISMISSED'),
    close: closeable.includes('CLOSED'),
    updateStatus: can(user, 'complaints:update_status', ctx) ? nextStatuses(complaint.status, 'complaints:update_status') : [],
    refer: can(user, 'complaints:refer', ctx) && nextStatuses(complaint.status, 'complaints:refer').length > 0,
    awaitingResponse: complaint.status === 'WAITING_RESPONSE',
  };
  const canContact = can(user, 'complaints:read_contact', ctx);
  // AC-05: «أنشئ مهمة» من الشكوى المحوّلة للجنة، لمن يملك tasks:create بنطاقها
  const taskMembers =
    complaint.committeeId && can(user, 'tasks:create', ctx) && complaint.status !== 'CLOSED' && complaint.status !== 'DISMISSED'
      ? await committeeMembers(db, complaint.committeeId)
      : null;
  const submitterLabel = complaint.isAnonymous ? 'مجهول' : complaint.submitterId ? 'حساب مسجّل' : 'زائر بلا حساب';
  return { complaint, actions, canContact, taskMembers, submitterLabel };
}

/** صندوق الوارد — قسم الشكاوى (complaints:triage): الجديدة وقيد الفرز، الأقدم أولًا */
export async function complaintInbox(user: SessionUser, p: Page) {
  requirePermission(user, 'complaints:triage');
  const where = { status: { in: ['SUBMITTED' as const, 'UNDER_REVIEW' as const] } };
  const [items, total] = await Promise.all([
    db.complaint.findMany({
      where,
      // الأقدم أولًا: لا تنتظر شكوى أطول من غيرها
      orderBy: { createdAt: 'asc' },
      ...skipTake(p),
      select: {
        id: true,
        reference: true,
        title: true,
        status: true,
        createdAt: true,
        category: { select: { nameAr: true, defaultCommittee: { select: { nameAr: true } } } },
        area: { select: { nameAr: true } },
      },
    }),
    db.complaint.count({ where }),
  ]);
  return { items, total, ...p };
}

/** بطاقات لوحة المجلس — كل عدّاد بنطاق المستخدم، وما لا يحق له = null */
export async function complaintTiles(user: SessionUser) {
  const triage = can(user, 'complaints:triage');
  const readScope = canBeyondOwn(user, 'complaints:read') ? readableComplaints(user) : null;
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const count = (where: Prisma.ComplaintWhereInput) => db.complaint.count({ where }).catch(() => null);
  const [newCount, reviewing, open, awaitingCommittee, resolved30] = await Promise.all([
    triage ? count({ status: 'SUBMITTED' }) : null,
    triage ? count({ status: 'UNDER_REVIEW' }) : null,
    readScope ? count({ AND: [readScope, { status: { in: OPEN_STATUSES } }] }) : null,
    readScope ? count({ AND: [readScope, { status: 'ASSIGNED' }] }) : null,
    readScope ? count({ AND: [readScope, { status: { in: ['RESOLVED', 'CLOSED'] }, updatedAt: { gte: monthAgo } }] }) : null,
  ]);
  return { triage, readable: !!readScope, newCount, reviewing, open, awaitingCommittee, resolved30 };
}
