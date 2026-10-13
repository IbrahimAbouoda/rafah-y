import 'server-only';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { skipTake, type Page } from '@/lib/paging';
import type { SessionUser } from '@/lib/rbac';

// شاشات الإعدادات (/admin/settings/*) — مشتركة بين صفحات الويب وواجهة الجوّال.

export async function settingsAreas(user: SessionUser) {
  requirePermission(user, 'settings:manage');
  return db.area.findMany({
    orderBy: { nameAr: 'asc' },
    select: { id: true, nameAr: true, parentId: true, parent: { select: { nameAr: true } }, _count: { select: { children: true } } },
  });
}

export async function settingsCategories(user: SessionUser) {
  requirePermission(user, 'settings:manage');
  const [categories, committees] = await Promise.all([
    db.complaintCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
      select: {
        id: true,
        nameAr: true,
        defaultCommitteeId: true,
        isActive: true,
        sortOrder: true,
        defaultCommittee: { select: { nameAr: true } },
      },
    }),
    db.committee.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, nameAr: true } }),
  ]);
  return { categories, committees };
}

export async function settingsCommittees(user: SessionUser) {
  requirePermission(user, 'committees:manage');
  return db.committee.findMany({
    orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
    select: { id: true, slug: true, nameAr: true, mandate: true, isActive: true, sortOrder: true },
  });
}

/** مصفوفة الأدوار والصلاحيات — قراءة فقط (§3.3 تُعدَّل من البذرة لا من الواجهة) */
export async function rolesMatrix(user: SessionUser) {
  requirePermission(user, 'users:manage_roles');
  const [roles, permissions] = await Promise.all([
    db.role.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        nameAr: true,
        requiresCommittee: true,
        permissions: { select: { permissionId: true, scope: true } },
        _count: { select: { permissions: true } },
      },
    }),
    db.permission.findMany({ orderBy: { key: 'asc' }, select: { id: true, key: true, descriptionAr: true, isPhase2: true } }),
  ]);
  return { roles, permissions };
}

export async function councilTerms(user: SessionUser) {
  requirePermission(user, 'users:manage_roles');
  return db.councilTerm.findMany({
    orderBy: { startsAt: 'desc' },
    select: { id: true, name: true, startsAt: true, endsAt: true, isCurrent: true, _count: { select: { assignments: true } } },
  });
}

/** /admin/settings/users — بحث بالاسم أو البريد أو الهاتف، مع التعيينات غير المسحوبة */
export async function userList(user: SessionUser, rawQ: string | undefined, p: Page) {
  requirePermission(user, 'users:manage_roles');
  const q = rawQ?.trim() ?? '';
  const where = q
    ? {
        OR: [
          { fullName: { contains: q, mode: 'insensitive' as const } },
          { email: { contains: q, mode: 'insensitive' as const } },
          { phone: { contains: q } },
        ],
      }
    : {};
  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...skipTake(p),
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        isActive: true,
        createdAt: true,
        roleAssignments: {
          where: { revokedAt: null },
          select: {
            id: true,
            endsAt: true,
            startsAt: true,
            revokedAt: true,
            role: { select: { nameAr: true, isTermBound: true } },
            committee: { select: { nameAr: true } },
            term: { select: { isCurrent: true } },
          },
        },
      },
    }),
    db.user.count({ where }),
  ]);
  return { items, total, q, ...p };
}

/** لوحة أدوار مستخدم: تعييناته كلها، وما يلزم نموذج التعيين. null ⇒ غير موجود. */
export async function userRoles(actor: SessionUser, userId: string) {
  requirePermission(actor, 'users:manage_roles');
  if (!z.uuid().safeParse(userId).success) return null;
  const user = await db.user.findFirst({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      isActive: true,
      roleAssignments: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          revokedAt: true,
          role: { select: { nameAr: true, isTermBound: true } },
          committee: { select: { nameAr: true } },
          term: { select: { name: true, isCurrent: true } },
        },
      },
    },
  });
  if (!user) return null;
  const [roles, committees, currentTerm] = await Promise.all([
    db.role.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, nameAr: true, requiresCommittee: true, isTermBound: true } }),
    db.committee.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, nameAr: true } }),
    db.councilTerm.findFirst({ where: { isCurrent: true }, select: { name: true } }),
  ]);
  return { user, roles, committees, currentTerm, isSelf: user.id === actor.id };
}
