import 'server-only';
import type { Db } from '@/lib/db';
import type { ApplicationStatus } from '@/lib/generated/prisma/enums';
import { memberOrganizationIds } from '@/lib/organizations';
import { can, type SessionUser } from '@/lib/rbac';
import { nextApplicationStatuses } from './workflow';

// listApplicants — opportunities:applicants بنطاق المؤسسة (D27) أو «الكل».
// القائمة بلا أي بيانات شخصية: رقم تسلسلي وحالة وتاريخ وهل وافق صاحبه على المشاركة (AC-11 ②).
// الملف والتواصل يُطلبان صراحةً لطلب واحد عبر viewApplicantAction، بسطر application.view (D31).

export type ApplicantRow = {
  id: string;
  /** ترتيب الطلب في الفرصة — بديل الاسم في القائمة */
  number: number;
  status: ApplicationStatus;
  shareProfile: boolean;
  createdAt: Date;
  nextStatuses: ApplicationStatus[];
};

/** يعيد طلبات كل فرصة يحق للمستخدم رؤية متقدّميها؛ الفرص خارج نطاقه لا مفتاح لها في النتيجة */
export async function listApplicants(
  db: Db,
  user: SessionUser,
  opportunities: { id: string; organizationId: string | null }[],
): Promise<Map<string, ApplicantRow[]>> {
  const out = new Map<string, ApplicantRow[]>();
  if (!can(user, 'opportunities:applicants') || opportunities.length === 0) return out;

  const myOrgs = new Set(await memberOrganizationIds(db, user.id));
  // ownerId = المستخدم نفسه حين تكون الفرصة لمؤسسة ينتمي إليها — هو أحد أعضائها
  const readable = opportunities.filter((o) =>
    can(user, 'opportunities:applicants', { ownerId: o.organizationId && myOrgs.has(o.organizationId) ? user.id : null }),
  );
  if (readable.length === 0) return out;

  const rows = await db.opportunityApplication.findMany({
    where: { opportunityId: { in: readable.map((o) => o.id) } },
    orderBy: { createdAt: 'asc' },
    // لا applicantId ولا message ولا أي علاقة بالمستخدم
    select: { id: true, opportunityId: true, status: true, shareProfile: true, createdAt: true },
  });
  for (const o of readable) out.set(o.id, []);
  for (const r of rows) {
    const list = out.get(r.opportunityId)!;
    list.push({
      id: r.id,
      number: list.length + 1,
      status: r.status,
      shareProfile: r.shareProfile,
      createdAt: r.createdAt,
      nextStatuses: nextApplicationStatuses(r.status, r.shareProfile),
    });
  }
  return out;
}
