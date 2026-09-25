import 'server-only';
import { db } from '@/lib/db';
import { securedTotals } from './workflow';

/** المبلغ المؤمَّن لكل مبادرة — من القيود الواردة المعتمدة فقط (§5.3) */
export async function securedByInitiative(initiativeIds: string[]): Promise<Map<string, Record<string, string>>> {
  if (initiativeIds.length === 0) return new Map();
  const rows = await db.fundingRecord.findMany({
    where: { initiativeId: { in: initiativeIds }, direction: 'INCOMING', approvedAt: { not: null } },
    select: { initiativeId: true, direction: true, amount: true, currency: true, approvedAt: true },
  });
  const grouped = new Map<string, typeof rows>();
  for (const r of rows) grouped.set(r.initiativeId!, [...(grouped.get(r.initiativeId!) ?? []), r]);
  return new Map(initiativeIds.map((id) => [id, securedTotals(grouped.get(id) ?? [])]));
}
