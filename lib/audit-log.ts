import 'server-only';
import { db } from '@/lib/db';
import { forbidden } from '@/lib/errors';
import type { Prisma } from '@/lib/generated/prisma/client';
import { skipTake, type Page } from '@/lib/paging';
import { canBeyondOwn, type SessionUser } from '@/lib/rbac';
import { gazaDayStart } from '@/lib/utils';

// /admin/audit — سجل التدقيق (AC-19). قراءة فقط: لا مسار يعدّل AuditLog أو يحذفه.

export type AuditFilter = { action?: string; actor?: string; entity?: string; from?: string; to?: string };

function parseDay(value: string | undefined, endOfDay: boolean): Date | null {
  const start = value ? gazaDayStart(value) : null;
  if (!start) return null;
  return endOfDay ? new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1) : start;
}

export async function auditLog(user: SessionUser, filter: AuditFilter, p: Page) {
  // AC-19 ④: لا يظهر السجل لمن لا يملك audit:read
  if (!canBeyondOwn(user, 'audit:read')) throw forbidden();
  const filters: Prisma.AuditLogWhereInput[] = [];
  if (filter.action) filters.push({ action: filter.action });
  const actor = filter.actor?.trim();
  if (actor) {
    filters.push({
      actor: { OR: [{ fullName: { contains: actor, mode: 'insensitive' } }, { email: { contains: actor, mode: 'insensitive' } }] },
    });
  }
  const entity = filter.entity?.trim();
  if (entity) filters.push({ entityId: entity });
  const from = parseDay(filter.from, false);
  const to = parseDay(filter.to, true);
  if (from || to) filters.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  const where: Prisma.AuditLogWhereInput = filters.length ? { AND: filters } : {};

  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      ...skipTake(p),
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        actorRoles: true,
        before: true,
        after: true,
        createdAt: true,
        actor: { select: { fullName: true } },
      },
    }),
    db.auditLog.count({ where }),
  ]);
  return { items, total, filtered: filters.length > 0, ...p };
}
