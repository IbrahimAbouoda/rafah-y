import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import type { DownloadFile } from '@/lib/export/file';
import { exportAttendanceAction } from '@/server/actions/activities/export';
import { exportComplaintsAction } from '@/server/actions/complaints/export';
import { exportApplicantsAction } from '@/server/actions/opportunities/export';
import { exportReportAction, generateReportAction } from '@/server/actions/reports';
import { actAs, committeeId, createUser, form } from '../support/factories';

// Sprint 5 — المحور ٣: التصدير. كل ملف بنفس قيود الواجهة (AC-14 ③ · D31)، وكل تصدير بسطر تدقيق.

async function sheetValues(file: DownloadFile): Promise<{ rightToLeft: boolean; header: string[]; cells: string[] }> {
  const wb = new ExcelJS.Workbook();
  // exceljs يعرّف Buffer بلا معامل النوع، و Node 24 يعيد Buffer<ArrayBuffer> — نفس الكائن وقت التشغيل
  await wb.xlsx.load(Buffer.from(file.base64, 'base64') as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0]!;
  const cells: string[] = [];
  ws.eachRow((row) => row.eachCell((c) => cells.push(String(c.value ?? ''))));
  const header = (ws.getRow(1).values as unknown[]).slice(1).map(String);
  return { rightToLeft: !!ws.views[0]?.rightToLeft, header, cells };
}

const auditCount = (action: string, entityId?: string) =>
  db.auditLog.count({ where: { action, ...(entityId ? { entityId } : {}) } });

describe('reports/export — PDF و XLSX من اللقطة', () => {
  async function report() {
    const secretary = await createUser(['secretary']);
    await actAs(secretary.id);
    const res = await generateReportAction(
      null,
      form({ title: 'تقرير التصدير', period: 'CUSTOM', from: '2012-01-01', to: '2012-03-31', summary: 'ملخص عربي للاختبار.' }),
    );
    return res!.data!.id;
  }

  it('PDF بالخط العربي المضمَّن + سطر report.export', async () => {
    const id = await report();
    const observer = await createUser(['municipality_observer']);
    await actAs(observer.id); // AC-14: المراقب يصدّر تقريرًا
    const before = await auditCount('report.export', id);
    const res = await exportReportAction(null, form({ reportId: id, format: 'pdf' }));
    expect(res).toMatchObject({ ok: true, data: { mimeType: 'application/pdf', filename: 'report-2012-01-01_2012-03-31.pdf' } });
    const pdf = Buffer.from(res!.data!.base64, 'base64');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1')).toContain('IBMPlexSansArabic');
    expect(await auditCount('report.export', id)).toBe(before + 1);
  });

  it('XLSX: ورقة المؤشرات RTL بالمؤشرات العشرة', async () => {
    const id = await report();
    const president = await createUser(['council_president']);
    await actAs(president.id);
    const res = await exportReportAction(null, form({ reportId: id, format: 'xlsx' }));
    expect(res).toMatchObject({ ok: true });
    const { rightToLeft, header, cells } = await sheetValues(res!.data!);
    expect(rightToLeft).toBe(true);
    expect(header).toEqual(['المؤشر', 'الاسم', 'التعريف', 'القيمة', 'القيمة الخام', 'الهدف المقترح']);
    for (const k of ['M1', 'M5', 'M10']) expect(cells).toContain(k);
  });

  it('بلا reports:export (رئيس لجنة، عضو) مرفوض، ولا سطر تدقيق', async () => {
    const id = await report();
    const before = await auditCount('report.export', id);
    for (const roles of [[{ key: 'committee_head' as const, committee: 'health-affairs' }], ['youth' as const]]) {
      const u = await createUser([...roles]);
      await actAs(u.id);
      expect(await exportReportAction(null, form({ reportId: id, format: 'pdf' }))).toMatchObject({
        ok: false,
        message: expect.stringContaining('لا تملك صلاحية'),
      });
    }
    expect(await auditCount('report.export', id)).toBe(before);
  });
});

describe('complaints/export — نفس قيود الحقول (AC-14 ③)', () => {
  it('لا اسم مقدّم ولا تواصل ولا نص في الملف، والمرشّحات مطبّقة', async () => {
    const youth = await createUser(['youth'], 'مقدم سري للغاية');
    const tag = randomUUID().slice(0, 6);
    const c = await db.complaint.create({
      data: {
        reference: `RF-CMP-EXP-${tag}`,
        accessCodeHash: 'x',
        title: `شكوى تصدير ${tag}`,
        body: 'نص سري لا يجب أن يظهر في ملف التصدير أبدًا.',
        submitterId: youth.id,
        status: 'RESOLVED',
        contact: { create: { nameEnc: Buffer.from('enc'), phoneEnc: Buffer.from('enc') } },
      },
    });
    const secretary = await createUser(['secretary']);
    await actAs(secretary.id);
    const before = await auditCount('complaint.export');
    const res = await exportComplaintsAction(null, form({ q: tag, status: 'RESOLVED' }));
    expect(res).toMatchObject({ ok: true });
    const { header, cells } = await sheetValues(res!.data!);
    expect(header).toEqual(['الرقم المرجعي', 'العنوان', 'الحالة', 'اللجنة', 'التصنيف', 'المنطقة', 'تاريخ التقديم', 'آخر تحديث']);
    expect(cells).toContain(c.reference);
    expect(cells.length).toBe(header.length * 2); // صف العناوين + شكوى واحدة
    const joined = cells.join('|');
    expect(joined).not.toContain('مقدم سري');
    expect(joined).not.toContain('نص سري');
    expect(joined).not.toContain(youth.email!);
    expect(await auditCount('complaint.export')).toBe(before + 1);

    // مرشّح لا يطابق ⇒ ملف بلا صفوف
    const none = await exportComplaintsAction(null, form({ q: tag, status: 'SUBMITTED' }));
    expect((await sheetValues(none!.data!)).cells.length).toBe(8);
  });

  it('مراقب البلدية ورئيس اللجنة بلا complaints:export مرفوضان', async () => {
    for (const roles of [['municipality_observer' as const], [{ key: 'committee_head' as const, committee: 'legal-affairs' }]]) {
      const u = await createUser([...roles]);
      await actAs(u.id);
      expect(await exportComplaintsAction(null, form({}))).toMatchObject({ ok: false, message: expect.stringContaining('لا تملك صلاحية') });
    }
  });
});

describe('opportunities/exportApplicants — قائمة D31 بلا بيانات شخصية', () => {
  async function opportunityWithApplicants() {
    const org = await db.organization.create({ data: { name: `مؤسسة تصدير ${randomUUID().slice(0, 6)}`, type: 'LOCAL_NGO' } });
    const rep = await createUser(['partner'], 'ممثل');
    await db.partnerMembership.create({ data: { userId: rep.id, organizationId: org.id } });
    const opp = await db.opportunity.create({
      data: { title: 'فرصة تصدير', description: 'وصف', type: 'TRAINING', applyMode: 'INTERNAL', status: 'PUBLISHED', organizationId: org.id, createdById: rep.id },
    });
    const a = await createUser(['youth'], 'متقدم باسم خاص');
    const b = await createUser(['youth'], 'متقدم آخر');
    await db.opportunityApplication.createMany({
      data: [
        { opportunityId: opp.id, applicantId: a.id, shareProfile: true, message: 'رسالة خاصة' },
        { opportunityId: opp.id, applicantId: b.id, shareProfile: false },
      ],
    });
    return { opp, rep, a };
  }

  it('المؤسسة صاحبة الفرصة تصدّر: رقم وحالة وموافقة وتاريخ فقط + application.export', async () => {
    const { opp, rep, a } = await opportunityWithApplicants();
    await actAs(rep.id);
    const res = await exportApplicantsAction(null, form({ opportunityId: opp.id }));
    expect(res).toMatchObject({ ok: true });
    const { header, cells } = await sheetValues(res!.data!);
    expect(header).toEqual(['رقم الطلب', 'الحالة', 'وافق على مشاركة ملفه', 'تاريخ التقديم']);
    expect(cells.length).toBe(4 * 3);
    const joined = cells.join('|');
    for (const secret of ['متقدم باسم خاص', 'رسالة خاصة', a.email!]) expect(joined).not.toContain(secret);
    expect(await auditCount('application.export', opp.id)).toBe(1);
    // التصدير لا يُعدّ قراءة ملف: لا سطر application.view
    expect(await db.auditLog.count({ where: { action: 'application.view', actorId: rep.id } })).toBe(0);
  });

  it('مؤسسة أخرى: غير موجودة لها، ولا سطر تدقيق', async () => {
    const { opp } = await opportunityWithApplicants();
    const other = await createUser(['partner'], 'ممثل آخر');
    const otherOrg = await db.organization.create({ data: { name: `مؤسسة أخرى ${randomUUID().slice(0, 6)}`, type: 'LOCAL_NGO' } });
    await db.partnerMembership.create({ data: { userId: other.id, organizationId: otherOrg.id } });
    await actAs(other.id);
    expect(await exportApplicantsAction(null, form({ opportunityId: opp.id }))).toMatchObject({ ok: false, message: expect.stringContaining('غير موجود') });
    expect(await auditCount('application.export', opp.id)).toBe(0);
  });

  it('أمين السر (بلا opportunities:applicants) مرفوض', async () => {
    const { opp } = await opportunityWithApplicants();
    const secretary = await createUser(['secretary']);
    await actAs(secretary.id);
    expect(await exportApplicantsAction(null, form({ opportunityId: opp.id }))).toMatchObject({ ok: false });
  });
});

describe('activities/exportAttendance — بنطاق لجنة النشاط', () => {
  async function activityWithRegistrations(slug: string) {
    const cid = await committeeId(slug);
    const head = await createUser([{ key: 'committee_head', committee: slug }]);
    const activity = await db.activity.create({
      data: { title: 'نشاط تصدير', committeeId: cid, startsAt: new Date(Date.now() - 3_600_000), status: 'PUBLISHED', createdById: head.id },
    });
    const y1 = await createUser(['youth'], 'حاضر');
    const y2 = await createUser(['youth'], 'ملغي');
    await db.activityRegistration.createMany({
      data: [
        { activityId: activity.id, userId: y1.id, status: 'ATTENDED', rating: 5, feedback: 'تعليق خاص', attendanceMarkedAt: new Date(), attendanceMarkedById: head.id },
        { activityId: activity.id, userId: y2.id, status: 'CANCELLED' },
      ],
    });
    return { activity, head, y1, y2 };
  }

  it('عضو اللجنة يصدّر أعمدة صفحة الحضور، بلا الملغى وبلا التقييمات + attendance.export', async () => {
    const { activity, y1 } = await activityWithRegistrations('sports-arts');
    const member = await createUser([{ key: 'committee_member', committee: 'sports-arts' }]);
    await actAs(member.id);
    const res = await exportAttendanceAction(null, form({ activityId: activity.id }));
    expect(res).toMatchObject({ ok: true });
    const { header, cells } = await sheetValues(res!.data!);
    expect(header).toEqual(['#', 'الاسم', 'الحالة', 'سجّل الحضور', 'وقت التسجيل']);
    expect(cells).toContain(y1.fullName);
    expect(cells).toContain('حضر');
    const joined = cells.join('|');
    expect(joined).not.toContain('ملغي');
    expect(joined).not.toContain('تعليق خاص');
    expect(await auditCount('attendance.export', activity.id)).toBe(1);
  });

  it('لجنة أخرى: غير موجود، والرئيس (بلا activities:attendance) مرفوض', async () => {
    const { activity } = await activityWithRegistrations('health-affairs');
    const outsider = await createUser([{ key: 'committee_member', committee: 'legal-affairs' }]);
    await actAs(outsider.id);
    expect(await exportAttendanceAction(null, form({ activityId: activity.id }))).toMatchObject({ ok: false, message: expect.stringContaining('غير موجود') });
    const president = await createUser(['council_president']);
    await actAs(president.id);
    expect(await exportAttendanceAction(null, form({ activityId: activity.id }))).toMatchObject({ ok: false, message: expect.stringContaining('لا تملك صلاحية') });
    expect(await auditCount('attendance.export', activity.id)).toBe(0);
  });
});
