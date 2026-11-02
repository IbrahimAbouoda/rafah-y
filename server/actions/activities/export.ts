'use server';

import { formToObject, runActionData, type DataState } from '@/lib/action';
import { REGISTRATION_STATUS_LABELS } from '@/lib/activities/workflow';
import { writeAudit } from '@/lib/audit';
import { requirePermission, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { fileDate, toDownload, XLSX_MIME, type DownloadFile } from '@/lib/export/file';
import { buildWorkbook } from '@/lib/export/xlsx';
import { can } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';
import { ExportAttendanceSchema } from '@/lib/validation/exports';

/**
 * activities/exportAttendance — XLSX لسجل الحضور بنطاق activities:attendance للجنة النشاط (AC-13 ④)،
 * وبأعمدة صفحة الحضور نفسها: الاسم والحالة ومن سجّل الحضور ومتى. التقييمات لا تُربط بالأسماء في الواجهة فلا تُصدَّر.
 */
export async function exportAttendanceAction(_prev: unknown, form: FormData): Promise<DataState<DownloadFile>> {
  return runActionData(async () => {
    const user = await requireUser();
    requirePermission(user, 'activities:attendance');
    const { activityId } = ExportAttendanceSchema.parse(formToObject(form));
    const activity = await db.activity.findUnique({ where: { id: activityId }, select: { id: true, title: true, committeeId: true } });
    // نشاط لجنة أخرى = غير موجود، كما في صفحة الحضور
    if (!activity || !can(user, 'activities:attendance', { committeeId: activity.committeeId })) throw notFound('النشاط');

    const registrations = await db.activityRegistration.findMany({
      where: { activityId: activity.id, status: { not: 'CANCELLED' } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      select: {
        status: true,
        attendanceMarkedAt: true,
        user: { select: { fullName: true } },
        attendanceMarkedBy: { select: { fullName: true } },
      },
    });

    const buffer = await buildWorkbook(
      [
        {
          name: 'الحضور',
          columns: [
            { header: '#', key: 'n', width: 6 },
            { header: 'الاسم', key: 'name', width: 30 },
            { header: 'الحالة', key: 'status', width: 16 },
            { header: 'سجّل الحضور', key: 'markedBy', width: 26 },
            { header: 'وقت التسجيل', key: 'markedAt', width: 20 },
          ],
          rows: registrations.map((r, i) => ({
            n: i + 1,
            name: r.user.fullName,
            status: REGISTRATION_STATUS_LABELS[r.status],
            markedBy: r.attendanceMarkedBy?.fullName ?? '—',
            markedAt: r.attendanceMarkedAt ? formatDateTime(r.attendanceMarkedAt) : '—',
          })),
        },
      ],
      `الحضور — ${activity.title}`,
    );

    await db.$transaction((tx) =>
      writeAudit(tx, user, 'attendance.export', 'Activity', activity.id, null, { rows: registrations.length }),
    );
    return {
      message: `جُهّز ملف ${registrations.length} مسجّل وبدأ تنزيله.`,
      data: toDownload(buffer, `attendance-${activity.id.slice(0, 8)}-${fileDate()}.xlsx`, XLSX_MIME),
    };
  });
}
