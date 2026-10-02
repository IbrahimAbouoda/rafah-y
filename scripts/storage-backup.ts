// نسخ حاوية المرفقات والتحقق من سلامتها — يستدعيه scripts/db-backup.sh (docs/ops/backup-and-restore.md).
//
//   npx tsx scripts/storage-backup.ts <outDir>
//
// 1) الحاوية موجودة وخاصة (public = false) — حاوية عامة خطأ أمني يُفشل النسخ.
// 2) كل كائن يُنزَّل إلى <outDir>/objects/<path> ويُسجَّل في manifest.json بحجمه وبصمته.
// 3) مطابقة مع file_objects: البصمة المسجّلة عند الرفع (§6.5) تطابق المنزَّل، وما في القاعدة موجود في التخزين.
//    عدم التطابق يُفشل النسخ؛ الكائن اليتيم (في التخزين بلا سجل) تحذير فقط.
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';
import { COMPLAINT_BUCKET } from '../lib/files';
import { PrismaClient } from '../lib/generated/prisma/client';

type Entry = { path: string; size: number; sha256: string };

async function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error('الاستخدام: npx tsx scripts/storage-backup.ts <outDir>');
    process.exit(2);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url || !key || !dbUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY و DIRECT_URL مطلوبة');
  const storage = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).storage;
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });
  const errors: string[] = [];
  const warnings: string[] = [];
  const entries: Entry[] = [];

  try {
    const { data: bucket, error: bucketError } = await storage.getBucket(COMPLAINT_BUCKET);
    if (bucketError || !bucket) {
      // الحاوية تُنشأ عند أول رفع (lib/storage.ts): غيابها يعني لا مرفقات بعد
      warnings.push(`الحاوية ${COMPLAINT_BUCKET} غير موجودة — لا مرفقات بعد.`);
    } else {
      if (bucket.public) errors.push(`الحاوية ${COMPLAINT_BUCKET} عامة! يجب أن تكون خاصة (§6.5). أصلحها من لوحة Storage.`);
      const bucketApi = storage.from(COMPLAINT_BUCKET);

      // سرد متكرر: المجلد عنصر بلا id
      const paths: string[] = [];
      const walk = async (prefix: string) => {
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await bucketApi.list(prefix, { limit: 1000, offset });
          if (error) throw error;
          for (const item of data) {
            const full = prefix ? `${prefix}/${item.name}` : item.name;
            if (item.id === null) await walk(full);
            else paths.push(full);
          }
          if (data.length < 1000) break;
        }
      };
      await walk('');

      for (const p of paths) {
        const { data, error } = await bucketApi.download(p);
        if (error || !data) {
          errors.push(`تعذّر تنزيل ${p}: ${error?.message ?? 'بلا بيانات'}`);
          continue;
        }
        const bytes = Buffer.from(await data.arrayBuffer());
        const target = path.join(outDir, 'objects', p);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, bytes);
        entries.push({ path: p, size: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') });
      }
    }

    // المطابقة مع القاعدة: ما قُبل أو ينتظر الفحص يجب أن يكون في التخزين وببصمته نفسها
    const rows = await db.fileObject.findMany({
      where: { bucket: COMPLAINT_BUCKET, deletedAt: null, scan: { not: 'FAILED' } },
      select: { path: true, sha256: true },
    });
    const stored = new Map(entries.map((e) => [e.path, e]));
    for (const row of rows) {
      const e = stored.get(row.path);
      if (!e) errors.push(`في file_objects بلا كائن في التخزين: ${row.path}`);
      else if (e.sha256 !== row.sha256) errors.push(`البصمة لا تطابق ما سُجّل عند الرفع: ${row.path}`);
    }
    const known = new Set(rows.map((r) => r.path));
    const orphans = entries.filter((e) => !known.has(e.path)).length;
    if (orphans > 0) warnings.push(`${orphans} كائنًا في التخزين بلا سجل فعّال (رفع لم يكتمل أو ملف مرفوض).`);

    await mkdir(outDir, { recursive: true });
    await writeFile(
      path.join(outDir, 'manifest.json'),
      JSON.stringify({ bucket: COMPLAINT_BUCKET, createdAt: new Date().toISOString(), objects: entries, dbRows: rows.length, warnings, errors }, null, 1),
    );
  } finally {
    await db.$disconnect();
  }

  for (const w of warnings) console.warn(`⚠ ${w}`);
  for (const e of errors) console.error(`✗ ${e}`);
  console.log(`التخزين: ${entries.length} كائنًا نُسخ · ${warnings.length} تحذير · ${errors.length} خطأ`);
  if (errors.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
