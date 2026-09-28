import 'server-only';
import { db } from '@/lib/db';
import { committeeHoldersOf, queueNotifications } from '@/lib/notify';

// §8.2 «اقتراب موعد مهمة (24 ساعة)»: العضو المسند إليه ورئيس اللجنة، داخل المنصة فقط.
// مرة واحدة لكل موعد: dueSoonNotifiedFor يحفظ قيمة dueAt التي ذُكِّر بها، فتغيير الموعد يسمح بتذكير جديد.
// المنجزة (DONE) والمحذوفة ناعمًا لا تُذكَّر. يُستدعى من app/api/cron/task-reminders (S5-1).

export const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function sendDueSoonReminders(now = new Date()): Promise<{ tasks: number }> {
  const candidates = await db.task.findMany({
    where: { status: { not: 'DONE' }, dueAt: { gt: now, lte: new Date(now.getTime() + DUE_SOON_WINDOW_MS) } },
    select: {
      id: true,
      title: true,
      dueAt: true,
      dueSoonNotifiedFor: true,
      assigneeId: true,
      committeeId: true,
      committee: { select: { slug: true } },
    },
  });

  let tasks = 0;
  for (const t of candidates) {
    const dueAt = t.dueAt!;
    if (t.dueSoonNotifiedFor?.getTime() === dueAt.getTime()) continue;
    const claimed = await db.$transaction(async (tx) => {
      // الحجز الذرّي: استدعاءان متزامنان للجدولة لا يرسلان التذكير مرتين، والمهمة التي أُنجزت أو غُيّر موعدها للتو تُترك
      const { count } = await tx.task.updateMany({
        where: {
          id: t.id,
          dueAt,
          status: { not: 'DONE' },
          deletedAt: null,
          OR: [{ dueSoonNotifiedFor: null }, { dueSoonNotifiedFor: { not: dueAt } }],
        },
        data: { dueSoonNotifiedFor: dueAt },
      });
      if (count === 0) return false;
      const heads = await committeeHoldersOf(tx, t.committeeId, 'tasks:approve');
      await queueNotifications(tx, [
        {
          type: 'TASK_DUE_SOON',
          title: `يحلّ موعد المهمة «${t.title}» خلال 24 ساعة`,
          link: `/admin/committees/${t.committee.slug}/tasks`,
          userIds: [t.assigneeId, ...heads],
          email: false,
        },
      ]);
      return true;
    });
    if (claimed) tasks++;
  }
  return { tasks };
}
