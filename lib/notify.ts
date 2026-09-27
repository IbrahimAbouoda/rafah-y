import 'server-only';
import type { Db, Tx } from '@/lib/db';
import type { NotificationType } from '@/lib/generated/prisma/enums';
import type { PermissionKey } from '@/lib/rbac';
import { appUrl } from '@/lib/config';
import { renderMail, sendMail } from '@/lib/mail';
import { logError } from '@/lib/log';

// الإشعارات — PRD §8.
// 1) queueNotifications() داخل معاملة الإجراء: سطر IN_APP لكل مستلم، وسطر EMAIL بحالة PENDING لمن يستحقه.
// 2) dispatchEmails() بعد انتهاء المعاملة: الإرسال خارجها، وفشله لا يُفشل الإجراء (§8.3).

export type NotificationDraft = {
  type: NotificationType;
  title: string;
  body?: string;
  /** مسار داخلي نسبي، مثل /me/complaints/RF-CMP-2026-000124 */
  link?: string;
  userIds: (string | null | undefined)[];
  /** هل للحدث قناة بريد في مصفوفة §8.2 */
  email: boolean;
};

/** يعيد معرّفات أسطر البريد المنتظرة لتُمرَّر إلى dispatchEmails() بعد المعاملة. */
export async function queueNotifications(tx: Tx, drafts: NotificationDraft[]): Promise<string[]> {
  const emailIds: string[] = [];
  for (const d of drafts) {
    const userIds = [...new Set(d.userIds.filter((id): id is string => !!id))];
    if (userIds.length === 0) continue;

    const now = new Date();
    await tx.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: d.type,
        title: d.title,
        body: d.body ?? null,
        link: d.link ?? null,
        channel: 'IN_APP' as const,
        status: 'SENT' as const,
        sentAt: now,
      })),
    });

    if (!d.email) continue;
    // البريد لمن لديه بريد ولم يوقف هذا النوع (§8.3 — إيقاف IN_APP غير ممكن أصلًا)
    const recipients = await tx.user.findMany({
      where: {
        id: { in: userIds },
        email: { not: null },
        isActive: true,
        notificationPreferences: { none: { type: d.type, channel: 'EMAIL', enabled: false } },
      },
      select: { id: true },
    });
    for (const r of recipients) {
      const row = await tx.notification.create({
        data: {
          userId: r.id,
          type: d.type,
          title: d.title,
          body: d.body ?? null,
          link: d.link ?? null,
          channel: 'EMAIL',
          status: 'PENDING',
        },
        select: { id: true },
      });
      emailIds.push(row.id);
    }
  }
  return emailIds;
}

/** خارج المعاملة. لا يرمي أبدًا: الفشل يُسجَّل FAILED على السطر نفسه. */
export async function dispatchEmails(db: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const rows = await db.notification.findMany({
      where: { id: { in: ids }, channel: 'EMAIL', status: 'PENDING' },
      select: { id: true, title: true, body: true, link: true, user: { select: { email: true, fullName: true } } },
    });
    for (const row of rows) {
      if (!row.user.email) continue;
      const { text, html } = renderMail({
        title: row.title,
        lines: [`مرحبًا ${row.user.fullName}،`, ...(row.body ? [row.body] : [])],
        link: row.link ? { href: `${appUrl()}${row.link}`, label: 'افتح التفاصيل في المنصة' } : undefined,
      });
      const ok = await sendMail({ to: row.user.email, subject: row.title, text, html });
      // لا ناقل مضبوطًا ⇒ يبقى PENDING ليُرسل حين يُضبط، ولا يُعلَّم فاشلًا
      if (ok) await db.notification.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date() } });
      else if (process.env.SMTP_HOST) await db.notification.update({ where: { id: row.id }, data: { status: 'FAILED' } });
    }
  } catch (e) {
    logError('notify', e);
  }
}

/**
 * من يحمل صلاحية بنطاق لجنة معيّنة الآن — مثل «رئيس اللجنة» في §8.2 دون مقارنة باسم دور:
 * المستلم هو من يملك complaints:update_status بنطاق COMMITTEE في هذه اللجنة تحديدًا (D16).
 */
export async function committeeHoldersOf(client: Db | Tx, committeeId: string, key: PermissionKey): Promise<string[]> {
  const now = new Date();
  const rows = await client.roleAssignment.findMany({
    where: {
      committeeId,
      revokedAt: null,
      startsAt: { lte: now },
      user: { isActive: true, deletedAt: null },
      role: { permissions: { some: { scope: 'COMMITTEE', permission: { key } } } },
      AND: [
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        { OR: [{ role: { isTermBound: false } }, { term: { isCurrent: true } }] },
      ],
    },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

/**
 * من يحمل صلاحية بنطاق «الكل» الآن — مثل «الرئيس وأمين السر» في §8.2 دون مقارنة باسم دور.
 */
export async function allScopeHoldersOf(client: Db | Tx, keys: PermissionKey[]): Promise<string[]> {
  const now = new Date();
  const rows = await client.roleAssignment.findMany({
    where: {
      revokedAt: null,
      startsAt: { lte: now },
      user: { isActive: true, deletedAt: null },
      role: { permissions: { some: { scope: 'ALL', permission: { key: { in: keys } } } } },
      AND: [
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        { OR: [{ role: { isTermBound: false } }, { term: { isCurrent: true } }] },
      ],
    },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}
