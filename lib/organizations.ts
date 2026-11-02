import 'server-only';
import type { Db, Tx } from '@/lib/db';
import { can, scopeFilter, type SessionUser } from '@/lib/rbac';

// المؤسسات الشريكة — D26 · D27.
// «خاص» للمؤسسة = سجلات المؤسسات التي ينتمي إليها المستخدم (PartnerMembership).
// يُمرَّر أعضاء المؤسسة إلى can() كـ ownerId، فيبقى can() هو الفحص الوحيد (C4).

/** معرّفات المؤسسات التي يمثّلها المستخدم */
export async function memberOrganizationIds(client: Db | Tx, userId: string): Promise<string[]> {
  const rows = await client.partnerMembership.findMany({
    where: { userId, organization: { deletedAt: null } },
    select: { organizationId: true },
  });
  return rows.map((r) => r.organizationId);
}

/** أعضاء المؤسسة — «ملّاك» سجلاتها لنطاق OWN */
export async function organizationMemberIds(client: Db | Tx, organizationId: string): Promise<string[]> {
  const rows = await client.partnerMembership.findMany({ where: { organizationId }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

/**
 * ملف مؤسسة لـ /admin/organizations/[id] — الحقول بحسب صلاحية القارئ (docs/code-and-security-audit.md):
 * M-1 (§3.4): بريد الممثلين لمن يملك organizations:manage وحده. M-2: العروض بنطاق offers:read.
 * الصفحة تفحص organizations:read (أبعد من «خاص») قبل الاستدعاء.
 */
export async function organizationProfile(client: Db, user: SessionUser, id: string) {
  const manage = can(user, 'organizations:manage');
  const log = can(user, 'organizations:log');
  // M-2: العروض بنطاق offers:read — رئيس اللجنة يرى عروض مبادرات لجنته فقط، لا كل عروض المؤسسة
  const offersScope = scopeFilter(user, 'offers:read');
  const readOffers = !!offersScope;
  // بلا offers:read لا تُقرأ العروض إطلاقًا (لا مجرد إخفائها في العرض)
  const offersWhere = !offersScope
    ? { id: { in: [] as string[] } }
    : offersScope.all
      ? {}
      : { initiative: { committeeId: { in: offersScope.committees } } };

  const org = await client.organization.findUnique({
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
      // M-1 (§3.4): البريد لمن يدير الربط فقط — مراقب البلدية وأعضاء اللجان يرون الأسماء، والبريد لا يُجلب لهم أصلًا
      members: { select: { isAdmin: true, user: { select: { id: true, fullName: true, email: manage } } } },
      interactions: {
        orderBy: { occurredAt: 'desc' },
        take: 50,
        select: { id: true, type: true, summary: true, occurredAt: true, followUpAt: true, loggedBy: { select: { fullName: true } } },
      },
      offers: {
        where: offersWhere,
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, types: true, amount: true, currency: true, status: true, createdAt: true, initiative: { select: { id: true, title: true } } },
      },
      initiativePartners: { select: { role: true, initiative: { select: { id: true, title: true } } } },
    },
  });
  return { org, manage, log, readOffers };
}
