'use server';

import { revalidatePath } from 'next/cache';
import { formToObject, runAction, runActionData, type ActionState, type DataState } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { requirePermission, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { conflict, forbidden, notFound } from '@/lib/errors';
import { collectMetrics, reportScope } from '@/lib/reports/collect';
import { parseSnapshot } from '@/lib/reports/metrics';
import { GenerateReportSchema, ReportIdSchema } from '@/lib/validation/reports';

// Sprint 5 — التقارير (AC-15). التوليد يحفظ لقطة metrics ثابتة لا يعدّلها أي إجراء لاحق،
// والنشر للرئيس وحده (reports:publish) بسطر report.publish في نفس المعاملة (§6.9).

/** reports/generate — لقطة المؤشرات للفترة كما هي الآن في القاعدة (AC-15 ①) */
export async function generateReportAction(_prev: unknown, form: FormData): Promise<DataState<{ id: string }>> {
  return runActionData(async () => {
    const user = await requireUser();
    requirePermission(user, 'reports:read');
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
