import 'server-only';
import { db } from '@/lib/db';
import { forbidden } from '@/lib/errors';
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

export async function organizationFile(user: SessionUser, id: string) {
  requireReader(user);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const org = await db.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      country: true,
      sectors: true,
      stage: true,
      website: true,
      lastContactAt: true,
      owner: { select: { fullName: true } },
      members: { select: { isAdmin: true, user: { select: { id: true, fullName: true, email: true } } } },
      interactions: {
        orderBy: { occurredAt: 'desc' },
        take: 50,
        select: { id: true, type: true, summary: true, occurredAt: true, followUpAt: true, loggedBy: { select: { fullName: true } } },
      },
      offers: {
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          types: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
          initiative: { select: { id: true, title: true } },
        },
      },
      initiativePartners: { select: { role: true, initiative: { select: { id: true, title: true } } } },
    },
  });
  if (!org) return null;
  return {
    org,
    can: {
      manage: can(user, 'organizations:manage'),
      log: can(user, 'organizations:log'),
      readOffers: can(user, 'offers:read'),
    },
  };
}
