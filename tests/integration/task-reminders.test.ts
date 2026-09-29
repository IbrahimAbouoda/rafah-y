import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { sendDueSoonReminders } from '@/lib/tasks/reminders';
import { GET, POST } from '@/app/api/cron/task-reminders/route';
import { committeeId, createUser } from '../support/factories';

// Sprint 5 — المحور ٤: TASK_DUE_SOON (§8.2) عبر مسار الجدولة S5-1.
// «تذكير المهمة يُرسل مرة واحدة ولا يُرسل للمنجزة» (§17 بند 11).

const H = 3_600_000;

async function team(slug: string) {
  const cid = await committeeId(slug);
  const head = await createUser([{ key: 'committee_head', committee: slug }], 'رئيس لجنة');
  const member = await createUser([{ key: 'committee_member', committee: slug }], 'عضو');
  return { cid, head, member };
}

async function task(t: Awaited<ReturnType<typeof team>>, dueAt: Date, status: 'TODO' | 'DONE' = 'TODO') {
  return db.task.create({
    data: { title: 'مهمة تذكير', committeeId: t.cid, createdById: t.head.id, assigneeId: t.member.id, dueAt, status },
  });
}

const dueSoonFor = (userId: string) => db.notification.findMany({ where: { userId, type: 'TASK_DUE_SOON' } });

describe('sendDueSoonReminders', () => {
  it('العضو ورئيس اللجنة يُشعَران داخل المنصة فقط، ومرة واحدة', async () => {
    const t = await team('health-affairs');
    const now = new Date();
    await task(t, new Date(now.getTime() + 12 * H));
    await sendDueSoonReminders(now);
    await sendDueSoonReminders(new Date(now.getTime() + H)); // استدعاء الساعة التالية

    for (const u of [t.member, t.head]) {
      const rows = await dueSoonFor(u.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ channel: 'IN_APP', link: '/admin/committees/health-affairs/tasks' });
    }
  });

  it('المنجزة، والبعيدة (> 24 ساعة)، والفائتة لا تُذكَّر', async () => {
    const t = await team('sports-arts');
    const now = new Date();
    await task(t, new Date(now.getTime() + 6 * H), 'DONE');
    await task(t, new Date(now.getTime() + 30 * H));
    await task(t, new Date(now.getTime() - H));
    await sendDueSoonReminders(now);
    expect(await dueSoonFor(t.member.id)).toHaveLength(0);
  });

  it('تغيير الموعد يسمح بتذكير جديد للموعد الجديد', async () => {
    const t = await team('legal-affairs');
    const now = new Date();
    const k = await task(t, new Date(now.getTime() + 5 * H));
    await sendDueSoonReminders(now);
    await db.task.update({ where: { id: k.id }, data: { dueAt: new Date(now.getTime() + 20 * H) } });
    await sendDueSoonReminders(now);
    expect(await dueSoonFor(t.member.id)).toHaveLength(2);
  });

  it('استدعاءان متزامنان لا يكرّران التذكير', async () => {
    const t = await team('health-affairs');
    const now = new Date();
    await task(t, new Date(now.getTime() + 3 * H));
    await Promise.all([sendDueSoonReminders(now), sendDueSoonReminders(now)]);
    expect(await dueSoonFor(t.member.id)).toHaveLength(1);
  });
});

describe('/api/cron/task-reminders — S5-1', () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });
  const call = (handler: typeof GET, auth?: string) =>
    handler(new Request('http://localhost/api/cron/task-reminders', { headers: auth ? { authorization: auth } : {} }));

  it('بلا CRON_SECRET على الخادم: 503 لكل استدعاء (فشل مغلق)', async () => {
    delete process.env.CRON_SECRET;
    expect((await call(POST, 'Bearer anything-at-all')).status).toBe(503);
  });

  it('سرّ خاطئ أو غائب: 401 ولا يُرسل شيء', async () => {
    process.env.CRON_SECRET = 'test-secret-0123456789';
    const t = await team('sports-arts');
    await task(t, new Date(Date.now() + 2 * H));
    expect((await call(POST)).status).toBe(401);
    expect((await call(GET, 'Bearer wrong-secret-0123456789')).status).toBe(401);
    expect(await dueSoonFor(t.member.id)).toHaveLength(0);
  });

  it('السرّ الصحيح: 200 ويُرسل التذكير', async () => {
    process.env.CRON_SECRET = 'test-secret-0123456789';
    const t = await team('legal-affairs');
    await task(t, new Date(Date.now() + 2 * H));
    const res = await call(GET, 'Bearer test-secret-0123456789');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, tasks: expect.any(Number) });
    expect(await dueSoonFor(t.member.id)).toHaveLength(1);
  });
});
