import 'server-only';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { buildPublicFinance } from '@/lib/finance/public';
import { buildFinancialReport } from '@/lib/finance/report';
import { ledgerTotals } from '@/lib/finance/totals';
import { securedTotals } from '@/lib/initiatives/workflow';
import { can, type SessionUser } from '@/lib/rbac';

// /admin/finance — السجل المالي (finance:read). المبلغ المؤمَّن من القيود الواردة المعتمدة فقط (§5.3).

export async function financeLedger(user: SessionUser) {
  requirePermission(user, 'finance:read');
  const record = can(user, 'finance:record');
  const approve = can(user, 'finance:approve');
  const [records, awaiting, initiatives, organizations, totalsRows] = await Promise.all([
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
        counterparty: true,
        category: true,
        documentNumber: true,
        initiativeId: true,
        organizationId: true,
        offerId: true,
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
    record ? db.organization.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }) : [],
    // المجاميع من كل القيود، لا من الصفحة المعروضة (take أعلاه)
    db.fundingRecord.findMany({ select: { direction: true, amount: true, currency: true, approvedAt: true } }),
  ]);
  return { records, awaiting, initiatives, organizations, secured: securedTotals(totalsRows), totals: ledgerTotals(totalsRows), can: { record, approve } };
}

/** /transparency/finance — عام بلا صلاحية: المعتمد فقط، ولا تُقرأ الحقول التي قد تحمل أسماء أفراد */
export async function publicFinance() {
  const rows = await db.fundingRecord.findMany({
    where: { approvedAt: { not: null } },
    select: { direction: true, amount: true, currency: true, approvedAt: true, category: true, organization: { select: { name: true } } },
  });
  return buildPublicFinance(rows);
}

/** التقرير الإداري والمالي: المعتمد فقط، إلا إذا طُلب شمول المعلّق صراحةً. */
export async function financialReport(user: SessionUser, range: { from?: Date; to?: Date; includePending: boolean }) {
  requirePermission(user, 'reports:read');
  requirePermission(user, 'finance:read');
  const rows = await db.fundingRecord.findMany({
    where: {
      ...(range.includePending ? {} : { approvedAt: { not: null } }),
      ...(range.to ? { occurredAt: { lte: range.to } } : {}),
    },
    select: {
      direction: true,
      amount: true,
      currency: true,
      occurredAt: true,
      description: true,
      counterparty: true,
      category: true,
      documentNumber: true,
      approvedAt: true,
      organization: { select: { name: true } },
      initiative: { select: { title: true } },
      approvedBy: { select: { fullName: true } },
    },
  });
  return buildFinancialReport(rows, range);
}
