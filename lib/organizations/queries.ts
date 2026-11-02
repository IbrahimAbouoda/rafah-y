import 'server-only';
import { db } from '@/lib/db';
import { forbidden } from '@/lib/errors';
import { organizationProfile } from '@/lib/organizations';
import { can, canBeyondOwn, type SessionUser } from '@/lib/rbac';

// /admin/organizations — CRM المؤسسات (organizations:read بنطاق يتجاوز «خاص»، كما في guardPage للصفحة).

function requireReader(user: SessionUser) {
  if (!canBeyondOwn(user, 'organizations:read')) throw forbidden();
}

export async function organizationList(user: SessionUser, q: string | undefined) {
  requireReader(user);
  const query = q?.trim() ?? '';
  const orgs = await db.organization.findMany({
    where: query ? { name: { contains: query, mode: 'insensitive' } } : {},
    orderBy: [{ lastContactAt: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
    take: 200,
    select: { id: true, name: true, type: true, stage: true, lastContactAt: true, _count: { select: { offers: true, members: true } } },
  });
  return { orgs, query, can: { manage: can(user, 'organizations:manage') } };
}

/**
 * ملف مؤسسة (/admin/organizations/[id] وواجهة الجوّال). الحقول بحسب صلاحية القارئ من organizationProfile():
 * M-1 بريد الممثلين لـ organizations:manage وحده، و M-2 العروض بنطاق offers:read — لا تُجلب أصلًا خارج ذلك.
 */
export async function organizationFile(user: SessionUser, id: string) {
  requireReader(user);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { org, manage, log, readOffers } = await organizationProfile(db, user, id);
  if (!org) return null;
  return { org, can: { manage, log, readOffers } };
}
