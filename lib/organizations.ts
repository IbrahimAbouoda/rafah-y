import 'server-only';
import type { Db, Tx } from '@/lib/db';

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
