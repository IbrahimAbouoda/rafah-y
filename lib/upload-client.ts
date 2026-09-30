'use client';

import { COMPLAINT_BUCKET } from '@/lib/files';
import { confirmUploadAction, createUploadUrlAction } from '@/server/actions/files';

// رفع المرفقات من المتصفح — PRD §6.5: الخادم يصدر رابطًا موقّعًا، الملف يذهب إلى التخزين مباشرة،
// ثم يتحقق الخادم منه (confirmUploadAction). لا يصل ملف إلى خادم التطبيق.

export type UploadOutcome = { name: string; ok: boolean; message: string };

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * رفع إلى رابط Supabase الموقّع بطلب واحد — ما يفعله storage.uploadToSignedUrl بالضبط، بلا تحميل supabase-js
 * كاملًا (≈ 100 ك.ب مضغوطة) على صفحة الشكوى التي يفتحها الزائر على اتصال ضعيف (§1.4).
 */
async function putToSignedUrl(path: string, token: string, blob: Blob): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('storage');
  const body = new FormData();
  body.append('cacheControl', '3600');
  body.append('', blob);
  const target = `${url}/storage/v1/object/upload/sign/${COMPLAINT_BUCKET}/${path}?token=${encodeURIComponent(token)}`;
  const res = await fetch(target, {
    method: 'PUT',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'x-upsert': 'false' },
    body,
  });
  return res.ok;
}

/** يرفع الملفات واحدًا واحدًا، ونتيجة كل ملف على حدة (§12 AttachmentUploader). */
export async function uploadComplaintFiles(
  reference: string,
  accessCode: string,
  files: { name: string; type: string; size: number; blob: Blob }[],
  onProgress?: (outcome: UploadOutcome) => void,
): Promise<UploadOutcome[]> {
  const results: UploadOutcome[] = [];
  for (const f of files) {
    let outcome: UploadOutcome;
    try {
      const ticket = await createUploadUrlAction({
        reference,
        accessCode,
        fileName: f.name,
        mimeType: f.type,
        sizeBytes: f.size,
        sha256: await sha256Hex(f.blob),
      });
      if (!ticket?.ok || !ticket.data) {
        outcome = { name: f.name, ok: false, message: ticket?.message ?? 'تعذّر تجهيز الرفع.' };
      } else {
        if (!(await putToSignedUrl(ticket.data.path, ticket.data.token, f.blob))) {
          outcome = { name: f.name, ok: false, message: 'انقطع الرفع. تحقق من الاتصال.' };
        } else {
          const confirmed = await confirmUploadAction({ reference, accessCode, fileId: ticket.data.fileId });
          outcome = { name: f.name, ok: !!confirmed?.ok, message: confirmed?.message ?? 'تعذّر التحقق من الملف.' };
        }
      }
    } catch {
      outcome = { name: f.name, ok: false, message: 'تعذّر رفع الملف الآن. شكواك وصلت، ويمكنك إرسال المرفق لأمانة السر لاحقًا.' };
    }
    results.push(outcome);
    onProgress?.(outcome);
  }
  return results;
}
