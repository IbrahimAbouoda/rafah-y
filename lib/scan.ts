import 'server-only';
import { isProduction } from '@/lib/config';
import { db } from '@/lib/db';
import { logError } from '@/lib/log';

// فحص الملفات — PRD §6.5 · D12. الملف لا يُعرض قبل CLEAN.
// التطوير: خدمة وهمية تنقل الملف إلى CLEAN بعد نصف ثانية — لا تعمل في الإنتاج أبدًا.
// الإنتاج: ClamAV عبر Webhook (Sprint 6)؛ حتى ذلك يبقى الملف PENDING ولا يُنزَّل.

const MOCK_DELAY_MS = 500;

export function scheduleScan(fileId: string): void {
  if (isProduction) return;
  setTimeout(() => {
    db.fileObject
      .updateMany({ where: { id: fileId, scan: 'PENDING' }, data: { scan: 'CLEAN' } })
      .catch((e: unknown) => logError('scan:mock', e));
  }, MOCK_DELAY_MS);
}
