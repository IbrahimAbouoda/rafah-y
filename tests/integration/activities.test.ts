import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  markAttendanceAction,
  rateActivityAction,
  registerAction,
  saveActivityAction,
  setActivityStatusAction,
} from '@/server/actions/activities';
import { actAs, committeeId, createUser, form } from '../support/factories';

// Sprint 4 — AC-13 · §5.5 · D34 (كل نشاط تتبعه لجنة)

const SLUG = 'sports-arts';
const inTwoDays = () => {
  const d = new Date(Date.now() + 2 * 24 * 3600_000);
  // قيمة datetime-local بتوقيت غزة
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Gaza', dateStyle: 'short', timeStyle: 'short' }).format(d).replace(' ', 'T');
};

async function publishedActivity(fields: Record<string, string> = {}) {
  const head = await createUser([{ key: 'committee_head', committee: SLUG }], 'رئيس لجنة');
  await actAs(head.id);
  expect(
    await saveActivityAction(
      null,
      form({
        committeeId: await committeeId(SLUG),
        title: 'ورشة رسم للشباب',
        kind: 'WORKSHOP',
        startsAt: inTwoDays(),
        registrationOpen: 'on',
        ...fields,
      }),
    ),
  ).toMatchObject({ ok: true });
  const activity = await db.activity.findFirstOrThrow({ where: { createdById: head.id }, orderBy: { createdAt: 'desc' } });
  expect(activity.status).toBe('DRAFT');
  expect(await setActivityStatusAction(null, form({ activityId: activity.id, toStatus: 'PUBLISHED' }))).toMatchObject({ ok: true });
  return { head, activity };
}

async function register(userId: string, activityId: string) {
  await actAs(userId);
  return registerAction(null, form({ activityId }));
}

/** يجعل النشاط قد بدأ — الحضور يُسجَّل بعد البدء فقط */
const startNow = (id: string) => db.activity.update({ where: { id }, data: { startsAt: new Date(Date.now() - 60_000) } });

describe('إنشاء النشاط ونشره — §5.5 · D34', () => {
  it('رئيس اللجنة ينشئ مسودة وينشرها؛ موعد datetime-local يُقرأ بتوقيت غزة', async () => {
    const { activity } = await publishedActivity({ startsAt: '2030-08-10T14:30' });
    const after = await db.activity.findUniqueOrThrow({ where: { id: activity.id } });
    expect(after.status).toBe('PUBLISHED');
    expect(after.startsAt.toISOString()).toBe('2030-08-10T11:30:00.000Z');
  });

  it('رفض غير المخوَّل: رئيس لجنة أخرى لا يعدّل ولا ينشر، وعضو اللجنة لا ينشئ، والشاب لا شيء', async () => {
    const head = await createUser([{ key: 'committee_head', committee: SLUG }]);
    await actAs(head.id);
    await saveActivityAction(null, form({ committeeId: await committeeId(SLUG), title: 'نشاط مسودة', kind: 'ACTIVITY', startsAt: inTwoDays() }));
    const draft = await db.activity.findFirstOrThrow({ where: { createdById: head.id } });

    const otherHead = await createUser([{ key: 'committee_head', committee: 'health-affairs' }]);
    await actAs(otherHead.id);
    expect(await setActivityStatusAction(null, form({ activityId: draft.id, toStatus: 'PUBLISHED' }))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/لا تملك صلاحية/),
    });
    // ولا ينقله إلى لجنته عبر التعديل
    expect(
      await saveActivityAction(
        null,
        form({ id: draft.id, committeeId: await committeeId('health-affairs'), title: 'استيلاء', kind: 'ACTIVITY', startsAt: inTwoDays() }),
      ),
    ).toMatchObject({ ok: false });

    const member = await createUser([{ key: 'committee_member', committee: SLUG }]);
    await actAs(member.id);
    expect(
      await saveActivityAction(null, form({ committeeId: await committeeId(SLUG), title: 'نشاط عضو', kind: 'ACTIVITY', startsAt: inTwoDays() })),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/لا تملك صلاحية/) });

    const youth = await createUser(['youth']);
    await actAs(youth.id);
    expect(await setActivityStatusAction(null, form({ activityId: draft.id, toStatus: 'PUBLISHED' }))).toMatchObject({ ok: false });
    expect((await db.activity.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('DRAFT');
  });

  it('الانتقال غير المسموح مرفوض برسالة عربية', async () => {
    const { activity } = await publishedActivity();
    expect(await setActivityStatusAction(null, form({ activityId: activity.id, toStatus: 'DRAFT' }))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/لا يمكن نقل/),
    });
  });
});

describe('التسجيل — AC-13 ① ②', () => {
  it('① امتلاء المقاعد يعطي WAITLISTED · ② التسجيل مرتين مرفوض', async () => {
    const { activity } = await publishedActivity({ seats: '1' });
    const [a, b] = [await createUser(['youth']), await createUser(['youth'])];
    expect(await register(a.id, activity.id)).toMatchObject({ ok: true, message: expect.stringMatching(/سُجّلت/) });
    expect(await register(b.id, activity.id)).toMatchObject({ ok: true, message: expect.stringMatching(/قائمة الانتظار/) });
    expect(await register(a.id, activity.id)).toMatchObject({ ok: false, message: expect.stringMatching(/من قبل/) });

    const regs = await db.activityRegistration.findMany({ where: { activityId: activity.id }, select: { userId: true, status: true } });
    expect(regs).toEqual(
      expect.arrayContaining([
        { userId: a.id, status: 'REGISTERED' },
        { userId: b.id, status: 'WAITLISTED' },
      ]),
    );
    expect(regs).toHaveLength(2);
  });

  it('المسودة والتسجيل المغلق والنشاط الذي بدأ: لا تسجيل', async () => {
    const youth = await createUser(['youth']);
    const head = await createUser([{ key: 'committee_head', committee: SLUG }]);
    await actAs(head.id);
    await saveActivityAction(null, form({ committeeId: await committeeId(SLUG), title: 'نشاط مسودة', kind: 'ACTIVITY', startsAt: inTwoDays(), registrationOpen: 'on' }));
    const draft = await db.activity.findFirstOrThrow({ where: { createdById: head.id } });
    expect(await register(youth.id, draft.id)).toMatchObject({ ok: false, message: expect.stringMatching(/غير منشور/) });

    const closed = await publishedActivity({ registrationOpen: '' });
    expect(await register(youth.id, closed.activity.id)).toMatchObject({ ok: false, message: expect.stringMatching(/مغلق/) });

    const started = await publishedActivity();
    await startNow(started.activity.id);
    expect(await register(youth.id, started.activity.id)).toMatchObject({ ok: false, message: expect.stringMatching(/بدأ/) });
  });

  it('رفض غير المخوَّل: عضو المجلس بلا دور شاب لا يسجّل', async () => {
    const { activity } = await publishedActivity();
    const secretary = await createUser(['secretary']);
    expect(await register(secretary.id, activity.id)).toMatchObject({ ok: false, message: expect.stringMatching(/لا تملك صلاحية/) });
  });
});

describe('الحضور والتقييم — AC-13 ③ ④', () => {
  it('④ الحضور باسم من سجّله · التقييم من الحاضر فقط', async () => {
    const { activity } = await publishedActivity({ seats: '1' });
    const [present, waiting] = [await createUser(['youth']), await createUser(['youth'])];
    await register(present.id, activity.id);
    await register(waiting.id, activity.id);
    const regs = await db.activityRegistration.findMany({ where: { activityId: activity.id } });
    const regOf = (id: string) => regs.find((r) => r.userId === id)!.id;

    const member = await createUser([{ key: 'committee_member', committee: SLUG }], 'عضو لجنة');
    await actAs(member.id);
    // قبل البدء مرفوض
    const marks = form({ activityId: activity.id, [`mark:${regOf(present.id)}`]: 'ATTENDED' });
    expect(await markAttendanceAction(null, marks)).toMatchObject({ ok: false, message: expect.stringMatching(/لم يبدأ/) });

    await startNow(activity.id);
    marks.set(`mark:${regOf(waiting.id)}`, 'NO_SHOW');
    expect(await markAttendanceAction(null, marks)).toMatchObject({ ok: true });
    const marked = await db.activityRegistration.findUniqueOrThrow({ where: { id: regOf(present.id) } });
    expect(marked).toMatchObject({ status: 'ATTENDED', attendanceMarkedById: member.id });
    expect(marked.attendanceMarkedAt).not.toBeNull();

    await actAs(waiting.id);
    expect(await rateActivityAction(null, form({ activityId: activity.id, rating: '5' }))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/لمن حضر/),
    });
    await actAs(present.id);
    expect(await rateActivityAction(null, form({ activityId: activity.id, rating: '6' }))).toMatchObject({
      ok: false,
      fieldErrors: { rating: expect.any(Array) },
    });
    expect(await rateActivityAction(null, form({ activityId: activity.id, rating: '4', feedback: 'ورشة مفيدة' }))).toMatchObject({ ok: true });
    expect(await db.activityRegistration.findUniqueOrThrow({ where: { id: regOf(present.id) } })).toMatchObject({ rating: 4, feedback: 'ورشة مفيدة' });
  });

  it('③ التقييم خارج 1–5 مرفوض من قاعدة البيانات نفسها', async () => {
    const { activity } = await publishedActivity();
    const youth = await createUser(['youth']);
    await register(youth.id, activity.id);
    const reg = await db.activityRegistration.findFirstOrThrow({ where: { activityId: activity.id } });
    await expect(db.activityRegistration.update({ where: { id: reg.id }, data: { rating: 6 } })).rejects.toThrow(/activity_registrations_rating_range/);
    await expect(db.activityRegistration.update({ where: { id: reg.id }, data: { rating: 0 } })).rejects.toThrow(/activity_registrations_rating_range/);
  });

  it('رفض غير المخوَّل: عضو لجنة أخرى ورئيس المجلس لا يسجّلان الحضور', async () => {
    const { activity } = await publishedActivity();
    const youth = await createUser(['youth']);
    await register(youth.id, activity.id);
    await startNow(activity.id);
    const reg = await db.activityRegistration.findFirstOrThrow({ where: { activityId: activity.id } });
    const marks = form({ activityId: activity.id, [`mark:${reg.id}`]: 'ATTENDED' });

    const outsider = await createUser([{ key: 'committee_member', committee: 'health-affairs' }]);
    await actAs(outsider.id);
    expect(await markAttendanceAction(null, marks)).toMatchObject({ ok: false, message: expect.stringMatching(/لا تملك صلاحية/) });
    // activities:attendance بنطاق اللجنة وحده في المصفوفة (§3.3)
    const president = await createUser(['council_president']);
    await actAs(president.id);
    expect(await markAttendanceAction(null, marks)).toMatchObject({ ok: false, message: expect.stringMatching(/لا تملك صلاحية/) });
    expect((await db.activityRegistration.findUniqueOrThrow({ where: { id: reg.id } })).status).toBe('REGISTERED');
  });

  it('تسجيل من نشاط آخر لا يُعلَّم حضوره عبر هذا النشاط', async () => {
    const one = await publishedActivity();
    const two = await publishedActivity();
    const youth = await createUser(['youth']);
    await register(youth.id, two.activity.id);
    await startNow(one.activity.id);
    const foreign = await db.activityRegistration.findFirstOrThrow({ where: { activityId: two.activity.id } });
    const member = await createUser([{ key: 'committee_member', committee: SLUG }]);
    await actAs(member.id);
    expect(await markAttendanceAction(null, form({ activityId: one.activity.id, [`mark:${foreign.id}`]: 'ATTENDED' }))).toMatchObject({ ok: false });
  });
});
