'use server';

import { formToObject, runActionData, type DataState } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { requirePermission, requireUser } from '@/lib/auth';
import { complaintListFilters, exportableComplaints } from '@/lib/complaints/queries';
import { STATUS_LABELS } from '@/lib/complaints/workflow';
import { db } from '@/lib/db';
import { forbidden, invalid } from '@/lib/errors';
import { fileDate, MAX_EXPORT_ROWS, toDownload, XLSX_MIME, type DownloadFile } from '@/lib/export/file';
import { buildWorkbook } from '@/lib/export/xlsx';
import { formatDateTime } from '@/lib/utils';
import { ExportComplaintsSchema } from '@/lib/validation/exports';

/**
 * complaints/export — XLSX لسجل الشكاوى بنطاق complaints:export وبمرشّحات /admin/complaints نفسها.
 * نفس قيود الحقول (AC-14 ③): أعمدة القائمة فقط — لا بيانات تواصل، ولا اسم مقدّم، ولا نص الشكوى.
 */
export async function exportComplaintsAction(_prev: unknown, form: FormData): Promise<DataState<DownloadFile>> {
  return runActionData(async () => {
    const user = await requireUser();
    requirePermission(user, 'complaints:export');
    const params = ExportComplaintsSchema.parse(formToObject(form));
    const scope = exportableComplaints(user);
    if (!scope) throw forbidden();

    const where = { AND: [scope, ...complaintListFilters(params)] };
    const total = await db.complaint.count({ where });
    if (total > MAX_EXPORT_ROWS) {
      throw invalid(`النتيجة ${total} شكوى، والحد ${MAX_EXPORT_ROWS} في الملف الواحد. ضيّق التصفية بالحالة أو اللجنة ثم صدّر.`);
    }
    const rows = await db.complaint.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      // قائمة بيضاء: لا submitter ولا contact ولا body
      select: {
        reference: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        committee: { select: { nameAr: true } },
        category: { select: { nameAr: true } },
        area: { select: { nameAr: true } },
      },
    });

    const buffer = await buildWorkbook(
      [
        {
          name: 'الشكاوى',
          columns: [
            { header: 'الرقم المرجعي', key: 'reference', width: 22 },
            { header: 'العنوان', key: 'title', width: 44 },
            { header: 'الحالة', key: 'status', width: 16 },
            { header: 'اللجنة', key: 'committee', width: 24 },
            { header: 'التصنيف', key: 'category', width: 20 },
            { header: 'المنطقة', key: 'area', width: 18 },
            { header: 'تاريخ التقديم', key: 'createdAt', width: 20 },
            { header: 'آخر تحديث', key: 'updatedAt', width: 20 },
          ],
          rows: rows.map((c) => ({
            reference: c.reference,
            title: c.title,
            status: STATUS_LABELS[c.status],
            committee: c.committee?.nameAr ?? '—',
            category: c.category?.nameAr ?? '—',
            area: c.area?.nameAr ?? '—',
            createdAt: formatDateTime(c.createdAt),
            updatedAt: formatDateTime(c.updatedAt),
          })),
        },
      ],
      'سجل الشكاوى',
    );

    await db.$transaction((tx) =>
      writeAudit(tx, user, 'complaint.export', 'Complaint', 'list', null, { rows: rows.length, filters: params }),
    );
    return { message: `جُهّز ملف ${rows.length} شكوى وبدأ تنزيله.`, data: toDownload(buffer, `complaints-${fileDate()}.xlsx`, XLSX_MIME) };
  });
}
