import 'server-only';
import type { Db, Tx } from '@/lib/db';
import type { NotificationType } from '@/lib/generated/prisma/enums';
import type { PermissionKey } from '@/lib/rbac';
import { appUrl } from '@/lib/config';
import { mailConfigured, renderMail, sendMail } from '@/lib/mail';
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

/** خارج المعاملة. لا يرمي أبدًا: الفشل يُسجَّل FAILED على السطر نفسه. بلا ناقل يبقى PENDING. */
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
      else if (mailConfigured()) await db.notification.update({ where: { id: row.id }, data: { status: 'FAILED' } });
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

/**
 * §8.3 «إعادة إرسال البريد المعلّق»: أسطر EMAIL بحالة PENDING (كُتبت حين لم يكن الناقل مضبوطًا) تُرسل الآن.
 * يُستدعى من app/api/cron/email-retry. بلا ناقل لا يفعل شيئًا، ولا يعيد FAILED (فشل حقيقي من الناقل).
 * تفضيل «إيقاف البريد» الذي ضُبط بعد كتابة السطر يُحترم: السطر يُلغى ولا يُرسل.
 */
export async function retryPendingEmails(db: Db, batch = 100, maxBatches = 10): Promise<{ sent: number; skipped: number }> {
  if (!mailConfigured()) return { sent: 0, skipped: 0 };
  // دفعات متتالية، الأقدم أولًا، بسقف لكل استدعاء — الباقي في الاستدعاء التالي للجدولة
  const total = { sent: 0, skipped: 0 };
  for (let i = 0; i < maxBatches; i++) {
    const r = await retryBatch(db, batch);
    total.sent += r.sent;
    total.skipped += r.skipped;
    if (r.processed < batch) break;
  }
  return total;
}

async function retryBatch(db: Db, batch: number): Promise<{ sent: number; skipped: number; processed: number }> {
  const rows = await db.notification.findMany({
    where: { channel: 'EMAIL', status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: batch,
    select: { id: true, userId: true, type: true },
  });
  if (rows.length === 0) return { sent: 0, skipped: 0, processed: 0 };
  const optedOut = await db.notificationPreference.findMany({
    where: { userId: { in: [...new Set(rows.map((r) => r.userId))] }, channel: 'EMAIL', enabled: false },
    select: { userId: true, type: true },
  });
  const off = new Set(optedOut.map((p) => `${p.userId}|${p.type}`));
  const skip = rows.filter((r) => off.has(`${r.userId}|${r.type}`)).map((r) => r.id);
  if (skip.length) await db.notification.updateMany({ where: { id: { in: skip } }, data: { status: 'FAILED' } });
  const send = rows.filter((r) => !off.has(`${r.userId}|${r.type}`)).map((r) => r.id);
  await dispatchEmails(db, send);
  const sent = await db.notification.count({ where: { id: { in: send }, status: 'SENT' } });
  return { sent, skipped: skip.length, processed: rows.length };
}

/** من يحمل صلاحية بأي نطاق الآن — مستلمو إشعار «استفسار بلا إجابة» (§8.2: فريق الدعم = support:respond) */
export async function permissionHolders(client: Db | Tx, key: PermissionKey): Promise<string[]> {
  const now = new Date();
  const rows = await client.roleAssignment.findMany({
    where: {
      revokedAt: null,
      startsAt: { lte: now },
      user: { isActive: true, deletedAt: null },
      role: { permissions: { some: { permission: { key } } } },
      AND: [
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        { OR: [{ role: { isTermBound: false } }, { term: { isCurrent: true } }] },
      ],
    },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}
