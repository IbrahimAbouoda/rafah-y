import 'server-only';
import { cache } from 'react';
import type { User as AuthUser } from '@supabase/supabase-js';
import { db } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { SIGNUP_ROLE_KEY } from '@/lib/config';
import { forbidden, unauthenticated } from '@/lib/errors';
import { can, type PermissionKey, type ScopeContext, type SessionUser } from '@/lib/rbac';
import { loadSessionUser } from '@/lib/session';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * يربط حساب Supabase بسجل User ويمنحه دور التسجيل الذاتي، في معاملة واحدة مع سطر التدقيق.
 * يُستدعى بعد التسجيل، ومرة أخرى عند أول دخول إن فشل الربط وقت التسجيل.
 */
export async function provisionUser(authUser: AuthUser): Promise<string> {
  const existing = await db.user.findUnique({ where: { authId: authUser.id }, select: { id: true } });
  if (existing) return existing.id;

  const meta = (authUser.user_metadata ?? {}) as { full_name?: string };
  const fullName = meta.full_name?.trim() || authUser.email || authUser.phone || 'مستخدم';

  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          authId: authUser.id,
          email: authUser.email || null,
          phone: authUser.phone ? `+${authUser.phone.replace(/^\+/, '')}` : null,
          fullName,
        },
      });
      const role = await tx.role.findUniqueOrThrow({ where: { key: SIGNUP_ROLE_KEY } });
      const assignment = await tx.roleAssignment.create({ data: { userId: user.id, roleId: role.id } });
      await writeAudit(tx, null, 'role.assign', 'RoleAssignment', assignment.id, null, assignment, {
        source: 'signup',
      });
      return user.id;
    });
  } catch (e) {
    // طلبان متزامنان لنفس الحساب: الثاني يجد ما أنشأه الأول
    const again = await db.user.findUnique({ where: { authId: authUser.id }, select: { id: true } });
    if (again) return again.id;
    throw e;
  }
}

/** المستخدم الحالي ومنحه — مرة واحدة لكل طلب. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const userId = await provisionUser(data.user);
  return loadSessionUser(db, userId);
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthenticated();
  return user;
}

/** فحص الخادم — بلا سياق: الصلاحية بأي نطاق · بسياق: على السجل تحديدًا. */
export function requirePermission(user: SessionUser, key: PermissionKey, ctx?: ScopeContext): void {
  if (!can(user, key, ctx)) throw forbidden();
}
