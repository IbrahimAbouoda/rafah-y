'use client';

import { createClient } from '@supabase/supabase-js';
import { COMPLAINT_BUCKET } from '@/lib/files';
import { confirmUploadAction, createUploadUrlAction } from '@/server/actions/files';

// رفع المرفقات من المتصفح — PRD §6.5: الخادم يصدر رابطًا موقّعًا، الملف يذهب إلى التخزين مباشرة،
// ثم يتحقق الخادم منه (confirmUploadAction). لا يصل ملف إلى خادم التطبيق.

export type UploadOutcome = { name: string; ok: boolean; message: string };

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function storageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).storage;
}

/** يرفع الملفات واحدًا واحدًا، ونتيجة كل ملف على حدة (§12 AttachmentUploader). */
export async function uploadComplaintFiles(
  reference: string,
  accessCode: string,
  files: { name: string; type: string; size: number; blob: Blob }[],
  onProgress?: (outcome: UploadOutcome) => void,
): Promise<UploadOutcome[]> {
  const storage = storageClient();
  const results: UploadOutcome[] = [];
  for (const f of files) {
    let outcome: UploadOutcome;
    try {
      if (!storage) throw new Error('storage');
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
        const { error } = await storage
          .from(COMPLAINT_BUCKET)
          .uploadToSignedUrl(ticket.data.path, ticket.data.token, f.blob, { contentType: f.type });
        if (error) {
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
