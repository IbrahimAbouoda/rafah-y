import 'server-only';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { verifyAccessCode, verifyAgainstDecoy } from './access-code';

// التحقق بالرقم + الرمز — PRD §5.1 «التتبّع» · §6.7 · AC-02.
// رسالة فشل واحدة لكل الحالات، وزمن متقارب سواء وُجد الرقم أم لا.

export const TRACK_FAILED =
  'لم نجد شكوى بهذا الرقم وهذا الرمز معًا. تأكد من الاثنين كما ظهرا لك عند التقديم — الرمز لا يُسترجع إن فُقد.';

export const trackFailed = () => new AppError(TRACK_FAILED, 'NOT_FOUND');

/** يعيد معرّف الشكوى إن طابق الرمز، وإلا null. لا يكشف أبدًا أيّ الاثنين كان خاطئًا. */
export async function verifyTracking(reference: string, accessCode: string): Promise<{ id: string } | null> {
  const complaint = await db.complaint.findUnique({
    where: { reference },
    select: { id: true, accessCodeHash: true },
  });
  if (!complaint) return verifyAgainstDecoy(accessCode).then(() => null);
  return (await verifyAccessCode(accessCode, complaint.accessCodeHash)) ? { id: complaint.id } : null;
}
