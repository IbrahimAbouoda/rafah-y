import 'server-only';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { securedTotals } from '@/lib/initiatives/workflow';
import { can, type SessionUser } from '@/lib/rbac';

// /admin/finance — السجل المالي (finance:read). المبلغ المؤمَّن من القيود الواردة المعتمدة فقط (§5.3).

export async function financeLedger(user: SessionUser) {
  requirePermission(user, 'finance:read');
  const record = can(user, 'finance:record');
  const approve = can(user, 'finance:approve');
  const [records, awaiting, initiatives] = await Promise.all([
    db.fundingRecord.findMany({
      orderBy: [{ approvedAt: { sort: 'asc', nulls: 'first' } }, { occurredAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        direction: true,
        amount: true,
        currency: true,
        occurredAt: true,
        description: true,
        approvedAt: true,
        recordedById: true,
        recordedBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
        initiative: { select: { id: true, title: true } },
        organization: { select: { name: true } },
      },
    }),
    // D29: عروض مالية مقبولة لم يُسجَّل قيدها بعد — يسجّلها أمين الصندوق
    db.supportOffer.findMany({
      where: { status: 'ACCEPTED', types: { has: 'FUNDING' }, amount: { not: null }, fundingRecords: { none: {} } },
      orderBy: { decidedAt: 'asc' },
      select: {
        id: true,
        amount: true,
        currency: true,
        decidedAt: true,
        organization: { select: { name: true } },
        initiative: { select: { title: true } },
      },
    }),
    record ? db.initiative.findMany({ where: { status: { notIn: ['DRAFT', 'CANCELLED'] } }, select: { id: true, title: true } }) : [],
  ]);
  return { records, awaiting, initiatives, secured: securedTotals(records), can: { record, approve } };
}
