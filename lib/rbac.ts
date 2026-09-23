// الصلاحيات — PRD §3. الدالة الوحيدة المسموح بها للفحص: can().
// لا مقارنة باسم دور أو معرّف مستخدم في أي مكان آخر.
import type { PermissionKey, RoleKey } from '@/prisma/rbac.seed';

export type { PermissionKey };

export type Grant = {
  all: boolean;
  own: boolean;
  /** اللجان التي يُمنح فيها هذا المفتاح بنطاق COMMITTEE — من التعيين الذي حمل المنحة تحديدًا */
  committees: Set<string>;
};

export type RoleSnapshot = {
  key: RoleKey | string;
  nameAr: string;
  committeeId: string | null;
  committeeSlug: string | null;
  committeeNameAr: string | null;
  endsAt: Date | null;
};

export type SessionUser = {
  id: string;
  authId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  roles: RoleSnapshot[];
  grants: Map<string, Grant>;
};

export type ScopeContext = {
  committeeId?: string | null;
  /** منشئ السجل أو المسند إليه — نطاق OWN */
  ownerId?: string | null | readonly (string | null)[];
};

/**
 * بلا سياق: هل يحمل المستخدم الصلاحية بأي نطاق؟ (الفحص المبكر قبل معالجة المدخلات — PRD §6.2)
 * بسياق: هل تشمل الصلاحية هذا السجل تحديدًا؟
 */
export function can(user: SessionUser | null, key: PermissionKey, ctx?: ScopeContext): boolean {
  if (!user) return false;
  const grant = user.grants.get(key);
  if (!grant) return false;
  if (!ctx) return true;
  if (grant.all) return true;
  if (ctx.committeeId && grant.committees.has(ctx.committeeId)) return true;
  if (grant.own && ctx.ownerId) {
    const owners = Array.isArray(ctx.ownerId) ? ctx.ownerId : [ctx.ownerId];
    if (owners.includes(user.id)) return true;
  }
  return false;
}

export type AssignmentRow = {
  committeeId: string | null;
  committee: { slug: string; nameAr: string } | null;
  endsAt: Date | null;
  role: {
    key: string;
    nameAr: string;
    permissions: { scope: 'OWN' | 'COMMITTEE' | 'ALL'; permission: { key: string } }[];
  };
};

/** يبني المنح من التعيينات الفعّالة. منطق خالص قابل للاختبار بلا قاعدة بيانات. */
export function buildGrants(assignments: AssignmentRow[]): Map<string, Grant> {
  const grants = new Map<string, Grant>();
  for (const a of assignments) {
    for (const rp of a.role.permissions) {
      let g = grants.get(rp.permission.key);
      if (!g) {
        g = { all: false, own: false, committees: new Set() };
        grants.set(rp.permission.key, g);
      }
      if (rp.scope === 'ALL') g.all = true;
      else if (rp.scope === 'OWN') g.own = true;
      else if (a.committeeId) g.committees.add(a.committeeId);
    }
  }
  return grants;
}

/** شكل قابل للتسلسل يُمرَّر إلى العميل لـ PermissionGate (إخفاء بصري فقط). */
export type SerializedGrants = Record<string, { all: boolean; own: boolean; committees: string[] }>;

export function serializeGrants(grants: Map<string, Grant>): SerializedGrants {
  const out: SerializedGrants = {};
  for (const [key, g] of grants) out[key] = { all: g.all, own: g.own, committees: [...g.committees] };
  return out;
}

/** لقطة الأدوار المحفوظة في AuditLog.actorRoles — «دور@لجنة» */
export function roleLabels(user: SessionUser): string[] {
  return user.roles.map((r) => (r.committeeSlug ? `${r.key}@${r.committeeSlug}` : r.key));
}
