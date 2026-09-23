import 'server-only';
import { db } from '@/lib/db';

/** عدّاد غير المقروء في الرأس. الفشل يُخفي الشارة ولا يكسر الرأس (PRD §12 Header). */
export async function unreadCount(userId: string): Promise<number | null> {
  try {
    return await db.notification.count({ where: { userId, channel: 'IN_APP', readAt: null } });
  } catch {
    return null;
  }
}

export async function currentTermName(): Promise<{ name: string } | null> {
  return db.councilTerm.findFirst({ where: { isCurrent: true }, select: { name: true } });
}
