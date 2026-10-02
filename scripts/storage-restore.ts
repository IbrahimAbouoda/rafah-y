// إعادة المرفقات من نسخة احتياطية — الخطوة الأخيرة في الاستعادة الفعلية (docs/ops/backup-and-restore.md).
//
//   npx tsx scripts/storage-restore.ts <مجلد backup-…_storage المستخرج>
//
// يتحقق من بصمة كل ملف مقابل manifest.json قبل رفعه، وينشئ الحاوية خاصة إن لم توجد، ولا يستبدل كائنًا موجودًا
// (upsert = false): إعادة التشغيل آمنة، والموجود يُعدّ ولا يُمس.
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { MAX_UPLOAD_BYTES, UPLOAD_MIME_TYPES } from '../lib/files';

type Manifest = { bucket: string; objects: { path: string; size: number; sha256: string }[] };

const MIME_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('الاستخدام: npx tsx scripts/storage-restore.ts <مجلد backup-…_storage>');
    process.exit(2);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY مطلوبان (للمشروع الهدف)');
  const storage = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).storage;
  const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8')) as Manifest;

  const { error: getError } = await storage.getBucket(manifest.bucket);
  if (getError) {
    const { error } = await storage.createBucket(manifest.bucket, {
      public: false,
      fileSizeLimit: MAX_UPLOAD_BYTES,
      allowedMimeTypes: [...UPLOAD_MIME_TYPES],
    });
    if (error) throw error;
  }

  let uploaded = 0;
  let existing = 0;
  let failed = 0;
  for (const o of manifest.objects) {
    const bytes = await readFile(path.join(dir, 'objects', o.path));
    if (bytes.byteLength !== o.size || createHash('sha256').update(bytes).digest('hex') !== o.sha256) {
      console.error(`✗ بصمة لا تطابق، لم يُرفع: ${o.path}`);
      failed++;
      continue;
    }
    const contentType = MIME_BY_EXT[o.path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
    const { error } = await storage.from(manifest.bucket).upload(o.path, bytes, { contentType, upsert: false });
    if (!error) uploaded++;
    else if (/exists|Duplicate/i.test(error.message)) existing++;
    else {
      console.error(`✗ ${o.path}: ${error.message}`);
      failed++;
    }
  }
  console.log(`التخزين: رُفع ${uploaded} · موجود مسبقًا ${existing} · فشل ${failed} (من ${manifest.objects.length})`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
