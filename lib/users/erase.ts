import 'server-only';
import { createHash } from 'node:crypto';
import { writeAudit } from '@/lib/audit';
import { SIGNUP_ROLE_KEY } from '@/lib/config';
import { db } from '@/lib/db';
import { isReferencedError } from '@/lib/db-errors';
import { notFound } from '@/lib/errors';
import { logError } from '@/lib/log';
import type { SessionUser } from '@/lib/rbac';
import { deleteAuthIdentity } from '@/lib/supabase/admin';

// محو الحساب — Sprint 6 · Q13 (قرار 2026-09-30). المستدعي يتحقق من الهوية والصلاحية والتأكيد:
// deleteMyAccountAction (الحساب نفسه) و anonymizeUserAction (users:manage_roles).
//
// 1) حذف فعلي إن لم يترك الحساب أثرًا: لم يحمل إلا دور التسجيل، ولا يشير إليه أي سجل آخر ولا سطر تدقيق.
//    المحاولة في معاملة؛ أي مرجع (RESTRICT، أو سطر تدقيق لا يُعدَّل) يُلغيها كلها فننتقل إلى 2.
// 2) وإلا تجهيل: البيانات المعرِّفة تُستبدل، والحساب يُعطَّل، والسجلات تبقى بلا صاحب معروف.
//    الشكاوى تبقى (D18) وتنفصل عن صاحبها، وبيانات التواصل المشفّرة المرفقة بها تُحذف.
// في الحالتين تُحذف هوية الدخول من Supabase Auth بعد المعاملة، فتسقط كلمة المرور والجلسات.
// أسطر التدقيق القديمة لا تُمسّ (AC-19)؛ السطر الجديد لا يحمل بريدًا ولا اسمًا ولا هاتفًا.

export const ANONYMIZED_NAME = 'مستخدم ملغى';

export const anonymizedEmail = (userId: string) =>
  `anonymized_${createHash('sha256').update(userId).digest('hex').slice(0, 16)}@deleted.invalid`;

export type EraseResult = { mode: 'deleted' | 'anonymized'; authDeleted: boolean };

/** actor = null حين يمحو المستخدم حسابه بنفسه: سطر التدقيق لا يشير إلى حساب سيُحذف (SET NULL على سطر لا يُعدَّل) */
export async function eraseUser(userId: string, actor: SessionUser | null): Promise<EraseResult> {
  const user = await db.user.findFirst({
    // المحذوف ناعمًا (المجهَّل) لا يُمحى مرتين
    where: { id: userId },
    select: { id: true, authId: true },
  });
  if (!user) throw notFound('الحساب');
  const source = actor ? 'admin' : 'self';

  const mode = (await tryHardDelete(user.id, actor, source)) ? 'deleted' : 'anonymized';
  if (mode === 'anonymized') await anonymize(user.id, actor, source);

  let authDeleted = true;
  try {
    await deleteAuthIdentity(user.authId);
  } catch (e) {
    // الحساب معطَّل في التطبيق على أي حال؛ الهوية تُحذف يدويًا من لوحة Supabase
    authDeleted = false;
    logError('erase-auth', e);
  }
  return { mode, authDeleted };
}

async function tryHardDelete(userId: string, actor: SessionUser | null, source: string): Promise<boolean> {
  // من حمل دورًا داخليًا يوماً جزءٌ من ذاكرة المجلس: تاريخ أدواره يبقى، فلا حذف فعلي
  const internal = await db.roleAssignment.count({ where: { userId, role: { key: { not: SIGNUP_ROLE_KEY } } } });
  if (internal > 0) return false;
  try {
    await db.$transaction(async (tx) => {
      // ما يخصه وحده ويمنع الحذف (RESTRICT): الملف الشخصي وتعيين التسجيل. التنبيهات والتفضيلات والمهارات CASCADE.
      await tx.youthProfile.deleteMany({ where: { userId } });
      await tx.roleAssignment.deleteMany({ where: { userId } });
      await tx.complaintContact.deleteMany({ where: { complaint: { submitterId: userId } } });
      await writeAudit(tx, actor, 'user.delete', 'User', userId, null, { mode: 'deleted' }, { source });
      await tx.user.delete({ where: { id: userId } });
    });
    return true;
  } catch (e) {
    if (isReferencedError(e)) return false;
    throw e;
  }
}

async function anonymize(userId: string, actor: SessionUser | null, source: string) {
  const now = new Date();
  await db.$transaction(async (tx) => {
    const contacts = await tx.complaintContact.deleteMany({ where: { complaint: { submitterId: userId } } });
    const complaints = await tx.complaint.updateMany({ where: { submitterId: userId }, data: { submitterId: null } });
    const inquiries = await tx.supportInquiry.updateMany({ where: { askerId: userId }, data: { askerId: null, contactHint: null } });
    const applications = await tx.opportunityApplication.updateMany({ where: { applicantId: userId }, data: { message: null } });
    const roles = await tx.roleAssignment.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revokedById: actor?.id ?? null },
    });
    const memberships = await tx.partnerMembership.deleteMany({ where: { userId } });
    await tx.youthSkill.deleteMany({ where: { userId } });
    await tx.youthProfile.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.notificationPreference.deleteMany({ where: { userId } });

    await tx.user.update({
      where: { id: userId },
      data: { email: anonymizedEmail(userId), phone: null, fullName: ANONYMIZED_NAME, isActive: false, deletedAt: now },
    });
    // أعداد فقط — لا بريد ولا اسم ولا هاتف في سطر التدقيق
    await writeAudit(
      tx,
      actor,
      'user.anonymize',
      'User',
      userId,
      null,
      {
        mode: 'anonymized',
        complaintsDetached: complaints.count,
        contactsDeleted: contacts.count,
        inquiriesDetached: inquiries.count,
        applicationsCleared: applications.count,
        rolesRevoked: roles.count,
        membershipsRemoved: memberships.count,
      },
      { source },
    );
  });
}
