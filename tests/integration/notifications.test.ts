import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { mailOutbox, resetMailAdapter } from '@/lib/mail';
import { queueNotifications, retryPendingEmails } from '@/lib/notify';
import { POST as emailRetry } from '@/app/api/cron/email-retry/route';
import { openNotificationAction, setEmailPreferencesAction } from '@/server/actions/notifications';
import { actAs, createUser, form } from '../support/factories';

// Sprint 5 — المحور ٤: تفضيلات البريد (§8.3) · إعادة إرسال المعلّق · فتح الإشعار.

const queue = (userId: string, type: 'COMPLAINT_RECEIVED' | 'IDEA_DECIDED') =>
  db.$transaction((tx) => queueNotifications(tx, [{ type, title: `اختبار ${type}`, link: '/me', userIds: [userId], email: true }]));

const rows = (userId: string, type: string) =>
  db.notification.findMany({ where: { userId, type: type as never }, select: { id: true, channel: true, status: true } });

describe('notifications/setPreference — §8.3', () => {
  it('إيقاف البريد لنوع يمنع سطر EMAIL ويُبقي IN_APP، والأنواع الأخرى كما هي', async () => {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    // كل الأنواع مفعّلة عدا COMPLAINT_RECEIVED
    const f = new FormData();
    f.append('email', 'IDEA_DECIDED');
    expect(await setEmailPreferencesAction(null, f)).toMatchObject({ ok: true });
    expect(
      await db.notificationPreference.findUniqueOrThrow({
        where: { userId_type_channel: { userId: youth.id, type: 'COMPLAINT_RECEIVED', channel: 'EMAIL' } },
      }),
    ).toMatchObject({ enabled: false });

    await queue(youth.id, 'COMPLAINT_RECEIVED');
    await queue(youth.id, 'IDEA_DECIDED');
    expect((await rows(youth.id, 'COMPLAINT_RECEIVED')).map((r) => r.channel)).toEqual(['IN_APP']);
    expect((await rows(youth.id, 'IDEA_DECIDED')).map((r) => r.channel).sort()).toEqual(['EMAIL', 'IN_APP']);
  });

  it('التفضيل لصاحبه فقط: لا يمسّ مستخدمًا آخر، وغير المسجَّل مرفوض', async () => {
    const a = await createUser(['youth']);
    const b = await createUser(['youth']);
    await actAs(a.id);
    await setEmailPreferencesAction(null, new FormData());
    expect(await db.notificationPreference.count({ where: { userId: b.id } })).toBe(0);
    await actAs(null);
    expect(await setEmailPreferencesAction(null, new FormData())).toMatchObject({ ok: false });
  });
});

describe('إعادة إرسال البريد المعلّق — §8.3', () => {
  const saved = { transport: process.env.MAIL_TRANSPORT, host: process.env.SMTP_HOST, secret: process.env.CRON_SECRET };
  beforeEach(() => {
    delete process.env.SMTP_HOST;
    delete process.env.MAIL_TRANSPORT;
    resetMailAdapter();
  });
  afterEach(() => {
    for (const [k, v] of [
      ['MAIL_TRANSPORT', saved.transport],
      ['SMTP_HOST', saved.host],
      ['CRON_SECRET', saved.secret],
    ] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetMailAdapter();
  });

  it('بلا ناقل يبقى PENDING؛ بعد ضبطه يُرسل، والموقوف بعد الكتابة لا يُرسل', async () => {
    const youth = await createUser(['youth']);
    const other = await createUser(['youth']);
    await queue(youth.id, 'IDEA_DECIDED');
    await queue(other.id, 'IDEA_DECIDED');
    const [mine] = (await rows(youth.id, 'IDEA_DECIDED')).filter((r) => r.channel === 'EMAIL');
    const [theirs] = (await rows(other.id, 'IDEA_DECIDED')).filter((r) => r.channel === 'EMAIL');
    expect(mine!.status).toBe('PENDING');
    // الأقدم أولًا: القاعدة المشتركة قد تحمل أسطرًا معلّقة من ملفات أخرى
    await db.notification.updateMany({ where: { id: { in: [mine!.id, theirs!.id] } }, data: { createdAt: new Date('2000-01-01T00:00:00Z') } });
    expect(await retryPendingEmails(db)).toEqual({ sent: 0, skipped: 0 });

    // الآخر يوقف البريد بعد كتابة السطر
    await db.notificationPreference.create({ data: { userId: other.id, type: 'IDEA_DECIDED', channel: 'EMAIL', enabled: false } });

    process.env.MAIL_TRANSPORT = 'memory';
    resetMailAdapter();
    const outboxBefore = mailOutbox().length;
    process.env.CRON_SECRET = 'test-secret-0123456789';
    const res = await emailRetry(new Request('http://localhost/api/cron/email-retry', { method: 'POST', headers: { authorization: 'Bearer test-secret-0123456789' } }));
    expect(res.status).toBe(200);

    expect((await db.notification.findUniqueOrThrow({ where: { id: mine!.id } })).status).toBe('SENT');
    expect((await db.notification.findUniqueOrThrow({ where: { id: theirs!.id } })).status).toBe('FAILED');
    const sentTo = mailOutbox().slice(outboxBefore).map((m) => m.to);
    expect(sentTo).toContain(youth.email);
    expect(sentTo).not.toContain(other.email);
  });
});

describe('openNotificationAction — يعلّم مقروءًا ثم ينتقل', () => {
  async function notificationFor(userId: string, link: string) {
    return db.notification.create({ data: { userId, type: 'IDEA_DECIDED', title: 'اختبار', link, channel: 'IN_APP', status: 'SENT' } });
  }
  const redirectTarget = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      const digest = (e as { digest?: string }).digest ?? '';
      return digest.startsWith('NEXT_REDIRECT') ? digest.split(';')[2] : `threw:${String(e)}`;
    }
    return 'no-redirect';
  };

  it('رابط داخلي: مقروء + انتقال إليه', async () => {
    const youth = await createUser(['youth']);
    const n = await notificationFor(youth.id, '/me/ideas');
    await actAs(youth.id);
    expect(await redirectTarget(openNotificationAction(null, form({ notificationId: n.id })))).toBe('/me/ideas');
    expect((await db.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt).toBeInstanceOf(Date);
  });

  it('رابط خارجي أو //host يعود لمركز الإشعارات', async () => {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    for (const link of ['https://evil.example', '//evil.example/x']) {
      const n = await notificationFor(youth.id, link);
      expect(await redirectTarget(openNotificationAction(null, form({ notificationId: n.id })))).toBe('/me/notifications');
    }
  });

  it('إشعار غيره = غير موجود، ولا يُعلَّم', async () => {
    const owner = await createUser(['youth']);
    const n = await notificationFor(owner.id, '/me');
    const intruder = await createUser(['youth']);
    await actAs(intruder.id);
    expect(await openNotificationAction(null, form({ notificationId: n.id }))).toMatchObject({ ok: false });
    expect((await db.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt).toBeNull();
  });
});
