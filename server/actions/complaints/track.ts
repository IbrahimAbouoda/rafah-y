'use server';

import { formToObject, runActionData, type DataState } from '@/lib/action';
import { trackFailed, verifyTracking } from '@/lib/complaints/tracking';
import { db } from '@/lib/db';
import { rateLimited } from '@/lib/errors';
import type { ComplaintStatus } from '@/lib/generated/prisma/enums';
import { limit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/request';
import { TrackSchema } from '@/lib/validation/complaints';

// AC-02 — تتبّع شكوى بلا تسجيل دخول. حد معدل على IP إلزامي (§6.4)، وكل محاولة تُحتسب ناجحة أو فاشلة.

export type TrackedComplaint = {
  reference: string;
  status: ComplaintStatus;
  committee: string | null;
  submittedAt: string;
  /** isPublic = true فقط — بلا منفّذين ولا ملاحظات داخلية ولا بيانات تواصل */
  events: { id: string; toStatus: ComplaintStatus; note: string | null; at: string }[];
};

export async function trackComplaintAction(_prev: unknown, form: FormData): Promise<DataState<TrackedComplaint>> {
  return runActionData(async () => {
    const gate = await limit('track', await clientIp());
    if (!gate.allowed) throw rateLimited(gate.retryAfterSec);
    const { reference, accessCode } = TrackSchema.parse(formToObject(form));

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
  });
}
