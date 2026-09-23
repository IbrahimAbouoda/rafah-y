import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { COMPLAINT_BUCKET } from '@/lib/files';
import { MAX_UPLOAD_BYTES, UPLOAD_MIME_TYPES } from '@/lib/validation/complaints';

export { COMPLAINT_BUCKET };

// Supabase Storage — PRD §6.5: تخزين خاص افتراضيًا، رفع وتنزيل عبر روابط موقّعة قصيرة العمر.
// يعمل بمفتاح الخدمة على الخادم فقط (SUPABASE_SERVICE_ROLE_KEY لا يبدأ بـ NEXT_PUBLIC_ — §6.10).

const DOWNLOAD_TTL_SEC = 60;

const globalForStorage = globalThis as unknown as { storageAdmin?: SupabaseClient; bucketReady?: Promise<void> };

function admin(): SupabaseClient {
  if (!globalForStorage.storageAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for storage');
    globalForStorage.storageAdmin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return globalForStorage.storageAdmin;
}

/** ينشئ الحاوية الخاصة إن لم توجد — بنفس القيود المفروضة في التطبيق (دفاع ثانٍ في Storage نفسه). */
function ensureBucket(): Promise<void> {
  globalForStorage.bucketReady ??= (async () => {
    const storage = admin().storage;
    const { data } = await storage.getBucket(COMPLAINT_BUCKET);
    if (data) return;
    const { error } = await storage.createBucket(COMPLAINT_BUCKET, {
      public: false,
      fileSizeLimit: MAX_UPLOAD_BYTES,
      allowedMimeTypes: [...UPLOAD_MIME_TYPES],
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  })().catch((e) => {
    globalForStorage.bucketReady = undefined;
    throw e;
  });
  return globalForStorage.bucketReady;
}

export async function createSignedUpload(path: string): Promise<{ signedUrl: string; token: string }> {
  await ensureBucket();
  const { data, error } = await admin().storage.from(COMPLAINT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error('createSignedUploadUrl returned no data');
  return { signedUrl: data.signedUrl, token: data.token };
}

/** null = لم يُرفع الملف بعد */
export async function downloadObject(path: string): Promise<Uint8Array | null> {
  const { data, error } = await admin().storage.from(COMPLAINT_BUCKET).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeObject(path: string): Promise<void> {
  await admin().storage.from(COMPLAINT_BUCKET).remove([path]);
}

export async function createSignedDownload(path: string, fileName: string): Promise<string> {
  const { data, error } = await admin()
    .storage.from(COMPLAINT_BUCKET)
    .createSignedUrl(path, DOWNLOAD_TTL_SEC, { download: fileName });
  if (error || !data) throw error ?? new Error('createSignedUrl returned no data');
  return data.signedUrl;
}
