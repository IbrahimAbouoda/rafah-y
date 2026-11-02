'use server';

import { formToObject, runActionData, type DataState } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { requirePermission, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { fileDate, toDownload, XLSX_MIME, type DownloadFile } from '@/lib/export/file';
import { buildWorkbook } from '@/lib/export/xlsx';
import { listApplicants } from '@/lib/opportunities/queries';
import { APPLICATION_STATUS_LABELS } from '@/lib/opportunities/workflow';
import { formatDateTime } from '@/lib/utils';
import { ExportApplicantsSchema } from '@/lib/validation/exports';

/**
 * opportunities/exportApplicants — XLSX لقائمة المتقدّمين بحقول listApplicants نفسها (D31):
 * رقم تسلسلي وحالة وتاريخ وهل وافق صاحبه — بلا اسم ولا تواصل. الملف الشخصي يبقى طلبًا فرديًا بسطر application.view.
 */
export async function exportApplicantsAction(_prev: unknown, form: FormData): Promise<DataState<DownloadFile>> {
  return runActionData(async () => {
    const user = await requireUser();
    requirePermission(user, 'opportunities:applicants');
    const { opportunityId } = ExportApplicantsSchema.parse(formToObject(form));
    const opportunity = await db.opportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true, title: true, organizationId: true },
    });
    if (!opportunity) throw notFound('الفرصة');
    // النطاق من listApplicants نفسها: فرصة خارج نطاقه لا مفتاح لها = غير موجودة له (لا يكشف التخمين وجودها)
    const rows = (await listApplicants(db, user, [opportunity])).get(opportunity.id);
    if (!rows) throw notFound('الفرصة');

    const buffer = await buildWorkbook(
      [
        {
          name: 'المتقدّمون',
          columns: [
            { header: 'رقم الطلب', key: 'number', width: 12 },
            { header: 'الحالة', key: 'status', width: 18 },
            { header: 'وافق على مشاركة ملفه', key: 'share', width: 22 },
            { header: 'تاريخ التقديم', key: 'createdAt', width: 20 },
          ],
          rows: rows.map((r) => ({
            number: r.number,
            status: APPLICATION_STATUS_LABELS[r.status],
            share: r.shareProfile ? 'نعم' : 'لا',
            createdAt: formatDateTime(r.createdAt),
          })),
        },
      ],
      `المتقدّمون — ${opportunity.title}`,
    );

    await db.$transaction((tx) =>
      writeAudit(tx, user, 'application.export', 'Opportunity', opportunity.id, null, { rows: rows.length }),
    );
    return {
      message: `جُهّز ملف ${rows.length} طلب وبدأ تنزيله.`,
      data: toDownload(buffer, `applicants-${opportunity.id.slice(0, 8)}-${fileDate()}.xlsx`, XLSX_MIME),
    };
  });
}
