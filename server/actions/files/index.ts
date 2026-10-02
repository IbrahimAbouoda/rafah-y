'use server';

import { createHash, randomUUID } from 'node:crypto';
import { requirePermission, requireUser } from '@/lib/auth';
import { formToObject, runActionData, type DataState } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { trackFailed, verifyTracking } from '@/lib/complaints/tracking';
import { db } from '@/lib/db';
import { invalid, notFound, rateLimited } from '@/lib/errors';
import { extensionFor, sniffMime } from '@/lib/files';
import { limit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/request';
import { scheduleScan } from '@/lib/scan';
import { COMPLAINT_BUCKET, createSignedDownload, createSignedUpload, downloadObject, removeObject } from '@/lib/storage';
import {
  ConfirmUploadSchema,
  CreateUploadSchema,
  FileIdSchema,
  MAX_FILES_PER_RECORD,
} from '@/lib/validation/complaints';

// الرفع الآمن — PRD §6.5 · AC-01 (مرفق اختياري).
// المرفق يُرفع بعد إنشاء الشكوى مباشرة، فيعمل للزائر والمجهول والمسودة المتزامنة بعد عودة الاتصال (§7.2).
// «صلاحية السجل المالك» هنا = الرقم + رمز المتابعة: الشكوى المجهولة لا حساب لها، والرمز لا يملكه إلا مقدّمها.

/** نافذة إرفاق الملفات بعد التقديم */
const ATTACH_WINDOW_MS = 24 * 60 * 60 * 1000;

async function ownedComplaint(reference: string, accessCode: string) {
  const match = await verifyTracking(reference, accessCode);
  if (!match) throw trackFailed();
  const complaint = await db.complaint.findUniqueOrThrow({
    where: { id: match.id },
    select: { id: true, status: true, createdAt: true, submitterId: true },
  });
  if (complaint.status !== 'SUBMITTED' || Date.now() - complaint.createdAt.getTime() > ATTACH_WINDOW_MS) {
    throw invalid('انتهت فترة إرفاق الملفات لهذه الشكوى: تُرفق المرفقات عند التقديم فقط.');
  }
  return complaint;
}

export type UploadTicket = { fileId: string; path: string; token: string; signedUrl: string };

export async function createUploadUrlAction(input: unknown): Promise<DataState<UploadTicket>> {
  return runActionData(async () => {
    const gate = await limit('upload', await clientIp());
    if (!gate.allowed) throw rateLimited(gate.retryAfterSec);
    const data = CreateUploadSchema.parse(input);
    const complaint = await ownedComplaint(data.reference, data.accessCode);

    const count = await db.fileObject.count({ where: { complaintId: complaint.id } });
    if (count >= MAX_FILES_PER_RECORD) {
      throw invalid(`وصلت الحد الأقصى: ${MAX_FILES_PER_RECORD} ملفات لكل شكوى.`);
    }

    const path = `complaints/${complaint.id}/${randomUUID()}.${extensionFor(data.mimeType)}`;
    const file = await db.fileObject.create({
      data: {
        bucket: COMPLAINT_BUCKET,
        path,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        sha256: data.sha256,
        // null للمجهولة والزائر (§6.7)
        uploadedById: complaint.submitterId,
        complaintId: complaint.id,
      },
      select: { id: true },
    });
    const ticket = await createSignedUpload(path);
    return { message: 'جاهز للرفع.', data: { fileId: file.id, path, ...ticket } };
  });
}

/**
 * بعد وصول الملف إلى التخزين: يُقرأ من التخزين نفسه ويُتحقق من حجمه ونوعه ببصمته وتجزئته،
 * لا مما صرّح به العميل. الملف المخالف يُحذف من التخزين ويُعلَّم FAILED.
 */
export async function confirmUploadAction(input: unknown): Promise<DataState<{ fileId: string }>> {
  return runActionData(async () => {
    const gate = await limit('uploadConfirm', await clientIp());
    if (!gate.allowed) throw rateLimited(gate.retryAfterSec);
    const data = ConfirmUploadSchema.parse(input);
    const complaint = await ownedComplaint(data.reference, data.accessCode);
    const file = await db.fileObject.findFirst({
      where: { id: data.fileId, complaintId: complaint.id, scan: 'PENDING' },
      select: { id: true, path: true, mimeType: true, sizeBytes: true, sha256: true },
    });
    if (!file) throw notFound('الملف');

    const bytes = await downloadObject(file.path);
    if (!bytes) throw invalid('لم يكتمل رفع الملف. أعد المحاولة.');

    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const problem =
      bytes.byteLength !== file.sizeBytes
        ? 'حجم الملف لا يطابق ما اختير. أعد اختياره.'
        : sniffMime(bytes) !== file.mimeType
          ? 'محتوى الملف لا يطابق نوعه. المسموح صور JPG أو PNG أو WEBP، أو ملف PDF حقيقي.'
          : sha256 !== file.sha256
            ? 'تغيّر الملف أثناء الرفع. أعد اختياره.'
            : null;
    if (problem) {
      await removeObject(file.path);
      await db.fileObject.update({ where: { id: file.id }, data: { scan: 'FAILED', deletedAt: new Date() } });
      throw invalid(problem);
    }

    scheduleScan(file.id);
    return { message: 'رُفع الملف، وهو قيد الفحص الأمني.', data: { fileId: file.id } };
  });
}

/** التنزيل برابط موقّع قصير العمر بعد فحص صلاحية القارئ على الشكوى نفسها (§6.5) — مع سطر file.download. */
export async function getDownloadUrlAction(_prev: unknown, form: FormData): Promise<DataState<{ url: string }>> {
  return runActionData(async () => {
    const user = await requireUser();
    requirePermission(user, 'complaints:read');
    const { fileId } = FileIdSchema.parse(formToObject(form));

    const file = await db.fileObject.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        path: true,
        mimeType: true,
        scan: true,
        complaint: { select: { id: true, reference: true, committeeId: true, submitterId: true } },
      },
    });
    if (!file?.complaint) throw notFound('الملف');
    requirePermission(user, 'complaints:read', {
      committeeId: file.complaint.committeeId,
      ownerId: file.complaint.submitterId,
    });
    if (file.scan !== 'CLEAN') throw invalid('الملف قيد الفحص الأمني ولا يُفتح قبل انتهائه. أعد المحاولة بعد قليل.');

    const url = await createSignedDownload(
      file.path,
      `${file.complaint.reference}-${file.id.slice(0, 8)}.${extensionFor(file.mimeType as Parameters<typeof extensionFor>[0])}`,
    );
    await db.$transaction(async (tx) => {
      await writeAudit(tx, user, 'file.download', 'FileObject', file.id, null, {
        complaintId: file.complaint!.id,
        reference: file.complaint!.reference,
      });
    });
    return { message: 'الرابط صالح لدقيقة واحدة.', data: { url } };
  });
}
