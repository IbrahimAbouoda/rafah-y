import 'server-only';
import { db } from '@/lib/db';
import { AppError, rateLimited } from '@/lib/errors';
import type { ComplaintStatus } from '@/lib/generated/prisma/enums';
import { limit } from '@/lib/rate-limit';
import { TrackSchema } from '@/lib/validation/complaints';
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

// AC-02 — تتبّع شكوى بلا تسجيل دخول. حد معدل على IP إلزامي (§6.4)، وكل محاولة تُحتسب ناجحة أو فاشلة.

export type TrackedComplaint = {
  reference: string;
  status: ComplaintStatus;
  committee: string | null;
  submittedAt: string;
  /** isPublic = true فقط — بلا منفّذين ولا ملاحظات داخلية ولا بيانات تواصل */
  events: { id: string; toStatus: ComplaintStatus; note: string | null; at: string }[];
};

export async function trackComplaint(input: unknown, ip: string): Promise<{ message: string; data: TrackedComplaint }> {
  {
    const gate = await limit('track', ip);
    if (!gate.allowed) throw rateLimited(gate.retryAfterSec);
    const { reference, accessCode } = TrackSchema.parse(input);

    const match = await verifyTracking(reference, accessCode);
    if (!match) throw trackFailed();

    const complaint = await db.complaint.findUniqueOrThrow({
      where: { id: match.id },
      select: {
        id: true,
        reference: true,
        status: true,
        createdAt: true,
        firstTrackedAt: true,
        committee: { select: { nameAr: true } },
        // الاستعلام نفسه لا يجلب إلا الأحداث العامة، ولا يجلب المنفّذ أصلًا
        events: {
          where: { isPublic: true },
          orderBy: { createdAt: 'asc' },
          select: { id: true, toStatus: true, note: true, createdAt: true },
        },
      },
    });
    // M5: أول فتح لصفحة التتبّع
    if (!complaint.firstTrackedAt) {
      await db.complaint.update({ where: { id: complaint.id }, data: { firstTrackedAt: new Date() } });
    }

    return {
      message: 'وجدنا شكواك.',
      data: {
        reference: complaint.reference,
        status: complaint.status,
        committee: complaint.committee?.nameAr ?? null,
        submittedAt: complaint.createdAt.toISOString(),
        events: complaint.events.map((e) => ({ id: e.id, toStatus: e.toStatus, note: e.note, at: e.createdAt.toISOString() })),
      },
    };
  }
}
