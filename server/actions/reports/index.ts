'use server';

import { revalidatePath } from 'next/cache';
import { formToObject, runAction, runActionData, type ActionState, type DataState } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { requirePermission, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { conflict, forbidden, notFound } from '@/lib/errors';
import { buildWorkbook } from '@/lib/export/xlsx';
import { PDF_MIME, toDownload, XLSX_MIME, type DownloadFile } from '@/lib/export/file';
import { buildReportPdf } from '@/lib/pdf/report-pdf';
import { collectMetrics, reportScope, visibleReportsWhere } from '@/lib/reports/collect';
import { formatMetric, formatTarget, METRIC_KEYS, METRICS, parseSnapshot, type MetricsSnapshot } from '@/lib/reports/metrics';
import { formatDateTime } from '@/lib/utils';
import { ExportReportSchema, GenerateReportSchema, PERIOD_LABELS, ReportIdSchema } from '@/lib/validation/reports';

// Sprint 5 — التقارير (AC-15). التوليد يحفظ لقطة metrics ثابتة لا يعدّلها أي إجراء لاحق،
// والنشر للرئيس وحده (reports:publish) بسطر report.publish في نفس المعاملة (§6.9).

/**
 * reports/generate — لقطة المؤشرات للفترة كما هي الآن في القاعدة (AC-15 ①).
 * reports:create (D35) لا reports:read: مراقب البلدية يقرأ ويصدّر ولا يولّد (AC-14).
 * نطاق الأرقام نفسه من reports:read — ما يحق له رؤيته.
 */
export async function generateReportAction(_prev: unknown, form: FormData): Promise<DataState<{ id: string }>> {
  return runActionData(async () => {
    const user = await requireUser();
    requirePermission(user, 'reports:create');
    const data = GenerateReportSchema.parse(formToObject(form));
    const scope = reportScope(user);
    if (!scope) throw forbidden();

    const snapshot = await collectMetrics({ from: data.from, to: data.to }, scope);
    const report = await db.report.create({
      data: {
        title: data.title,
        period: data.period,
        periodStart: new Date(`${data.from}T00:00:00Z`),
        periodEnd: new Date(`${data.to}T00:00:00Z`),
        metrics: snapshot,
        summaryMd: data.summary ?? null,
        createdById: user.id,
      },
      select: { id: true },
    });
    revalidatePath('/admin/reports');
    return { message: 'وُلّد التقرير بلقطة ثابتة من أرقام الآن. راجعه قبل النشر.', data: report };
  });
}

/** reports/publish — يظهر في /transparency بلا تسجيل دخول */
export async function publishReportAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'reports:publish');
    const { reportId } = ReportIdSchema.parse(formToObject(form));
    const report = await db.report.findUnique({
      where: { id: reportId },
      select: { id: true, title: true, isPublished: true, metrics: true },
    });
    if (!report) throw notFound('التقرير');
    // التقرير لا يتبع لجنة: النشر لمن يملك الصلاحية بنطاق «الكل»
    requirePermission(user, 'reports:publish', { committeeId: null });
    if (report.isPublished) throw conflict('نُشر هذا التقرير من قبل.');
    const snapshot = parseSnapshot(report.metrics);
    if (!snapshot) throw conflict('لقطة هذا التقرير تالفة أو بصيغة قديمة. ولّد تقريرًا جديدًا للفترة نفسها.');
    // لقطة بنطاق لجنة ناقصة المؤشرات العامة، فلا تُنشر للعامة كأنها أرقام المجلس
    if (snapshot.scope !== 'ALL') throw conflict('هذا التقرير وُلّد بنطاق لجنة. يُنشر فقط تقرير مولَّد بنطاق كل المنصة.');

    await db.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.report.updateMany({
        where: { id: report.id, isPublished: false },
        data: { isPublished: true, publishedAt: now, publishedById: user.id },
      });
      if (count === 0) throw conflict('نُشر هذا التقرير للتو. حدّث الصفحة.');
      await writeAudit(tx, user, 'report.publish', 'Report', report.id, { isPublished: false }, {
        isPublished: true,
        publishedAt: now,
        title: report.title,
      });
    });
    revalidatePath('/admin/reports');
    revalidatePath('/transparency');
    revalidatePath(`/transparency/reports/${report.id}`);
    return 'نُشر التقرير ويظهر الآن في صفحة الشفافية.';
  });
}

/**
 * reports/export — PDF للتقرير الرسمي أو XLSX للإحصاءات (D14)، من اللقطة المحفوظة نفسها لا من أرقام حيّة.
 * يُولَّد على الخادم ويُسلَّم مباشرة بلا ملف دائم، وكل تصدير بسطر report.export.
 */
export async function exportReportAction(_prev: unknown, form: FormData): Promise<DataState<DownloadFile>> {
  return runActionData(async () => {
    const user = await requireUser();
    requirePermission(user, 'reports:export');
    const { reportId, format } = ExportReportSchema.parse(formToObject(form));
    const scope = reportScope(user);
    if (!scope) throw forbidden();
    const report = await db.report.findFirst({
      where: { id: reportId, ...visibleReportsWhere(user, scope) },
      select: { id: true, title: true, period: true, metrics: true, summaryMd: true, isPublished: true, createdAt: true },
    });
    if (!report) throw notFound('التقرير');
    requirePermission(user, 'reports:export', { committeeId: null });
    const snapshot = parseSnapshot(report.metrics);
    if (!snapshot) throw conflict('لقطة هذا التقرير تالفة أو بصيغة قديمة فلا يمكن تصديرها. ولّد تقريرًا جديدًا للفترة نفسها.');

    const base = `report-${snapshot.from}_${snapshot.to}`;
    const file =
      format === 'pdf'
        ? toDownload(
            await buildReportPdf({
              title: report.title,
              periodLabel: PERIOD_LABELS[report.period],
              snapshot,
              summary: report.summaryMd,
              status: report.isPublished ? 'منشور' : 'مسودة غير منشورة',
              generatedAt: formatDateTime(new Date(snapshot.generatedAt)),
            }),
            `${base}.pdf`,
            PDF_MIME,
          )
        : toDownload(await reportWorkbook(report.title, snapshot), `${base}.xlsx`, XLSX_MIME);

    await db.$transaction((tx) =>
      writeAudit(tx, user, 'report.export', 'Report', report.id, null, { format, from: snapshot.from, to: snapshot.to }),
    );
    return { message: 'جُهّز الملف وبدأ تنزيله.', data: file };
  });
}

function reportWorkbook(title: string, s: MetricsSnapshot) {
  return buildWorkbook(
    [
      {
        name: 'المؤشرات',
        columns: [
          { header: 'المؤشر', key: 'key', width: 8 },
          { header: 'الاسم', key: 'label', width: 26 },
          { header: 'التعريف', key: 'definition', width: 60 },
          { header: 'القيمة', key: 'value', width: 14 },
          { header: 'القيمة الخام', key: 'raw', width: 14 },
          { header: 'الهدف المقترح', key: 'target', width: 16 },
        ],
        rows: METRIC_KEYS.map((k) => ({
          key: k,
          label: METRICS[k].label,
          definition: METRICS[k].definition,
          value: formatMetric(k, s.values[k]) ?? (METRICS[k].pending ? 'لم يُفعَّل بعد' : 'لا بيانات'),
          raw: s.values[k],
          target: formatTarget(k),
        })),
      },
      {
        name: 'الاتجاه الشهري',
        columns: [
          { header: 'الشهر', key: 'month', width: 12 },
          { header: 'الشكاوى', key: 'complaints', width: 12 },
          { header: 'وسيط زمن الفرز (ساعة)', key: 'triage', width: 22, numFmt: '0.0' },
          { header: 'نسبة الإغلاق', key: 'closure', width: 14, numFmt: '0%' },
        ],
        rows: s.trend.map((p) => ({ month: p.month, complaints: p.complaints, triage: p.triageMedianHours, closure: p.closureRate })),
      },
      {
        name: 'عن التقرير',
        columns: [
          { header: 'البند', key: 'k', width: 22 },
          { header: 'القيمة', key: 'v', width: 60 },
        ],
        rows: [
          { k: 'العنوان', v: title },
          { k: 'الفترة', v: `${s.from} ← ${s.to}` },
          { k: 'وقت اللقطة', v: formatDateTime(new Date(s.generatedAt)) },
          { k: 'ملاحظة', v: 'الأرقام لقطة ثابتة وقت إعداد التقرير، والأهداف مقترحة لم يُقرّها المجلس بعد.' },
        ],
      },
    ],
    title,
  );
}
