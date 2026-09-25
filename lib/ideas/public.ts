import 'server-only';
import { db } from '@/lib/db';
import { can, type SessionUser } from '@/lib/rbac';
import { VOTABLE_IDEA_STATUSES } from './workflow';
import type { IdeaStatus } from '@/lib/generated/prisma/enums';

export type VoteMode = 'can' | 'voted' | 'login' | 'closed';

/** حالة زر التصويت لكل فكرة للمستخدم الحالي — تُحسب على الخادم */
export async function voteModes(user: SessionUser | null, ideas: { id: string; status: IdeaStatus }[]): Promise<Map<string, VoteMode>> {
  const modes = new Map<string, VoteMode>();
  const voted = user
    ? new Set(
        (await db.ideaVote.findMany({ where: { userId: user.id, ideaId: { in: ideas.map((i) => i.id) } }, select: { ideaId: true } })).map(
          (v) => v.ideaId,
        ),
      )
    : new Set<string>();
  for (const i of ideas) {
    if (!VOTABLE_IDEA_STATUSES.includes(i.status)) modes.set(i.id, 'closed');
    else if (!user) modes.set(i.id, 'login');
    else if (voted.has(i.id)) modes.set(i.id, 'voted');
    else modes.set(i.id, can(user, 'ideas:vote') ? 'can' : 'closed');
  }
  return modes;
}
