import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import type { SessionUser } from '@/lib/rbac';
import { loadSessionUser } from '@/lib/session';
import type { RoleKey } from '@/prisma/rbac.seed';
import { setTestUser } from './identity';

// بيانات اختبار مولَّدة — لا أسماء ولا أرقام حقيقية (C6)

type RoleSpec = RoleKey | { key: RoleKey; committee?: string; endsAt?: Date; revoked?: boolean; startsAt?: Date };

export async function committeeId(slug: string): Promise<string> {
  return (await db.committee.findUniqueOrThrow({ where: { slug } })).id;
}

export async function createUser(roles: RoleSpec[] = [], name = 'مستخدم اختبار') {
  const tag = randomUUID().slice(0, 8);
  const user = await db.user.create({
    data: { authId: randomUUID(), fullName: `${name} ${tag}`, email: `test-${tag}@example.test` },
  });
  const term = await db.councilTerm.findFirst({ where: { isCurrent: true } });
  for (const spec of roles) {
    const s = typeof spec === 'string' ? { key: spec } : spec;
    const role = await db.role.findUniqueOrThrow({ where: { key: s.key } });
    await db.roleAssignment.create({
      data: {
        userId: user.id,
        roleId: role.id,
        termId: role.isTermBound ? term?.id : null,
        committeeId: s.committee ? await committeeId(s.committee) : null,
        endsAt: s.endsAt ?? null,
        startsAt: s.startsAt ?? new Date(Date.now() - 1000),
        revokedAt: s.revoked ? new Date() : null,
      },
    });
  }
  return user;
}

export async function session(userId: string): Promise<SessionUser> {
  const s = await loadSessionUser(db, userId);
  if (!s) throw new Error('user not loadable');
  return s;
}

/** يجعل Server Actions ترى هذا المستخدم كمستخدم الطلب الحالي */
export async function actAs(userId: string | null): Promise<SessionUser | null> {
  const s = userId ? await session(userId) : null;
  setTestUser(s);
  return s;
}

export function form(fields: Record<string, string | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) f.set(k, v);
  return f;
}
