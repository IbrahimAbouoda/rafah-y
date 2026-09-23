'use server';

import { requirePermission, requireUser } from '@/lib/auth';
import { formToObject, runActionData, type DataState } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { decryptField } from '@/lib/crypto';
import { db } from '@/lib/db';
import { notFound } from '@/lib/errors';
import type { ContactChannel } from '@/lib/generated/prisma/enums';
import { ComplaintIdSchema } from '@/lib/validation/complaints';

// PRD §6.6: فك تشفير بيانات التواصل داخل دالة واحدة تفحص complaints:read_contact قبل أن تعمل،
// وتكتب سطر complaint.contact_read بكل قراءة. البيانات لا تُرسل مع الصفحة أصلًا — فقط عند الطلب الصريح.

export type ComplaintContactView = {
  anonymous: boolean;
  /** الحساب الذي قدّمها — للشكوى غير المجهولة من حساب */
  account: { fullName: string; email: string | null; phone: string | null } | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  preferredChannel: ContactChannel | null;
};

export async function readContactAction(_prev: unknown, form: FormData): Promise<DataState<ComplaintContactView>> {
  return runActionData(async () => {
    const user = await requireUser();
    requirePermission(user, 'complaints:read_contact');
    const { complaintId } = ComplaintIdSchema.parse(formToObject(form));

    const complaint = await db.complaint.findUnique({
      where: { id: complaintId },
      select: {
        id: true,
        committeeId: true,
        isAnonymous: true,
        submitter: { select: { fullName: true, email: true, phone: true } },
        contact: true,
      },
    });
    if (!complaint) throw notFound('الشكوى');
    requirePermission(user, 'complaints:read_contact', { committeeId: complaint.committeeId });

    const c = complaint.contact;
    const view: ComplaintContactView = {
      anonymous: complaint.isAnonymous,
      account: complaint.submitter,
      name: c?.nameEnc ? decryptField(c.nameEnc) : null,
      phone: c?.phoneEnc ? decryptField(c.phoneEnc) : null,
      email: c?.emailEnc ? decryptField(c.emailEnc) : null,
      preferredChannel: c?.preferredChannel ?? null,
    };

    await db.$transaction(async (tx) => {
      // القيم نفسها لا تُنسخ إلى التدقيق — يكفي أنها قُرئت ومن قرأها وأي الحقول وُجدت
      await writeAudit(tx, user, 'complaint.contact_read', 'Complaint', complaint.id, null, {
        fields: {
          account: !!view.account,
          name: !!view.name,
          phone: !!view.phone,
          email: !!view.email,
        },
      });
    });

    const empty = !view.account && !view.name && !view.phone && !view.email;
    return {
      message: complaint.isAnonymous
        ? 'الشكوى مجهولة: لا بيانات تواصل معها. صاحبها يتابع بالرقم والرمز.'
        : empty
          ? 'لم يترك مقدّم الشكوى بيانات تواصل.'
          : 'سُجّلت قراءتك لبيانات التواصل في سجل التدقيق.',
      data: view,
    };
  });
}
