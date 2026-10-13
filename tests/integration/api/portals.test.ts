import { beforeEach, describe, expect, it } from 'vitest';
import { GET as audit } from '@/app/api/mobile/v1/admin/audit/route';
import { GET as committeeBoard } from '@/app/api/mobile/v1/admin/committees/[slug]/tasks/route';
import { GET as adminDashboard } from '@/app/api/mobile/v1/admin/dashboard/route';
import { POST as approveFunding } from '@/app/api/mobile/v1/admin/finance/[id]/approve/route';
import { GET as finance, POST as recordFunding } from '@/app/api/mobile/v1/admin/finance/route';
import { POST as needs } from '@/app/api/mobile/v1/admin/initiatives/[id]/needs/route';
import { GET as initiativeFile } from '@/app/api/mobile/v1/admin/initiatives/[id]/route';
import { POST as initiativeStatus } from '@/app/api/mobile/v1/admin/initiatives/[id]/status/route';
import { GET as initiatives, POST as createInitiative } from '@/app/api/mobile/v1/admin/initiatives/route';
import { POST as decideOffer } from '@/app/api/mobile/v1/admin/offers/[id]/decide/route';
import { POST as linkMember } from '@/app/api/mobile/v1/admin/organizations/[id]/members/route';
import { POST as revokeRole } from '@/app/api/mobile/v1/admin/role-assignments/[id]/revoke/route';
import { POST as assignRole } from '@/app/api/mobile/v1/admin/settings/users/[id]/roles/route';
import { GET as users } from '@/app/api/mobile/v1/admin/settings/users/route';
import { POST as approveTask } from '@/app/api/mobile/v1/admin/tasks/[id]/approve/route';
import { POST as moveTask } from '@/app/api/mobile/v1/admin/tasks/[id]/move/route';
import { GET as myTasks, POST as createTask } from '@/app/api/mobile/v1/admin/tasks/route';
import { GET as meDashboard } from '@/app/api/mobile/v1/me/dashboard/route';
import { POST as readOne } from '@/app/api/mobile/v1/me/notifications/[id]/read/route';
import { POST as readAll } from '@/app/api/mobile/v1/me/notifications/read-all/route';
import { GET as notifications } from '@/app/api/mobile/v1/me/notifications/route';
import { GET as session } from '@/app/api/mobile/v1/me/session/route';
import { GET as partnerDashboard } from '@/app/api/mobile/v1/partner/dashboard/route';
import { GET as partnerOffers, POST as submitOffer } from '@/app/api/mobile/v1/partner/offers/route';
import { GET as publicInitiatives } from '@/app/api/mobile/v1/public/initiatives/route';
import { db } from '@/lib/db';
import { call } from '../../support/api';
import { actAs, committeeId, createUser, freshIp } from '../../support/factories';

// واجهة الجوّال — المبادرات وبوابة المؤسسات والمالية والمهام والإشعارات والتدقيق والأدوار

async function published(slug = 'activities-initiatives') {
  const head = await createUser([{ key: 'committee_head', committee: slug }], 'رئيس لجنة');
  await actAs(head.id);
  const created = await call(createInitiative, { body: { committeeId: await committeeId(slug), title: 'مبادرة صيف الشباب' } });
  expect(created.status).toBe(201);
  const initiative = await db.initiative.findFirstOrThrow({ where: { createdById: head.id } });
  const id = initiative.id;
  expect((await call(needs, { params: { id }, body: { type: 'FUNDING', description: 'تمويل أدوات الورش', amount: '2000.50' } })).status).toBe(200);
  expect((await call(initiativeStatus, { params: { id }, body: { toStatus: 'PENDING_APPROVAL' } })).status).toBe(200);
  // رئيس اللجنة لا ينشر بنفسه
  expect((await call(initiativeStatus, { params: { id }, body: { toStatus: 'PUBLISHED' } })).status).toBe(403);
  const president = await createUser(['council_president'], 'الرئيس');
  await actAs(president.id);
  expect((await call(initiativeStatus, { params: { id }, body: { toStatus: 'PUBLISHED' } })).status).toBe(200);
  const need = await db.initiativeNeed.findFirstOrThrow({ where: { initiativeId: id } });
  return { head, president, initiative, need };
}

async function partner() {
  const org = await db.organization.create({ data: { name: `مؤسسة اختبار ${Date.now()}`, type: 'LOCAL_NGO' } });
  const secretary = await createUser(['secretary']);
  const rep = await createUser([], 'ممثل مؤسسة');
  await actAs(secretary.id);
  expect((await call(linkMember, { params: { id: org.id }, body: { email: rep.email } })).status).toBe(200);
  return { org, rep };
}

beforeEach(() => {
  freshIp();
});

describe('المبادرات — AC-09', () => {
  it('المنشورة تظهر للعامة، ورئيس لجنة أخرى لا يفتح ملفها', async () => {
    const { initiative } = await published();
    const list = await call<{ id: string; secured: Record<string, string> }[]>(publicInitiatives, { auth: false });
    expect(list.data.some((i) => i.id === initiative.id)).toBe(true);

    const other = await createUser([{ key: 'committee_head', committee: 'health-affairs' }]);
    await actAs(other.id);
    expect((await call(initiativeFile, { params: { id: initiative.id } })).status).toBe(404);
  });

  it('التبويبات بصلاحياتها: تبويب لا تملكه ← 403', async () => {
    const head = await createUser([{ key: 'committee_head', committee: 'activities-initiatives' }]);
    await actAs(head.id);
    const list = await call<{ tabs: { key: string }[] }>(initiatives);
    expect(list.status).toBe(200);
    if (!list.data.tabs.some((t) => t.key === 'notes')) {
      expect((await call(initiatives, { query: { tab: 'notes' } })).status).toBe(403);
    }
  });
});

describe('بوابة المؤسسات — AC-10 · D27', () => {
  it('الممثل يقدّم عرضًا لمؤسسته ويرى عروضها فقط؛ الشاب 403؛ الرئيس يقرّر', async () => {
    const { initiative, need, president } = await published();
    const a = await partner();
    const b = await partner();

    const youth = await createUser(['youth']);
    await actAs(youth.id);
    expect((await call(partnerDashboard)).status).toBe(403);

    await actAs(a.rep.id);
    const dash = await call<{ orgs: { id: string }[] }>(partnerDashboard);
    expect(dash.data.orgs.map((o) => o.id)).toEqual([a.org.id]);

    const body = { initiativeId: initiative.id, needId: need.id, organizationId: a.org.id, types: ['FUNDING'], amount: '2000.50' };
    expect((await call(submitOffer, { body })).status).toBe(201);
    // باسم مؤسسة ليست مؤسسته
    expect((await call(submitOffer, { body: { ...body, organizationId: b.org.id } })).status).toBe(403);
    // AC-10 ①: بلا نوع
    expect((await call(submitOffer, { body: { ...body, types: [] } })).status).toBe(422);

    await actAs(b.rep.id);
    expect((await call<unknown[]>(partnerOffers)).data).toHaveLength(0);

    const offer = await db.supportOffer.findFirstOrThrow({ where: { organizationId: a.org.id } });
    await actAs(president.id);
    expect((await call(decideOffer, { params: { id: offer.id }, body: { decision: 'ACCEPTED' } })).status).toBe(200);
    expect((await db.initiativeNeed.findUniqueOrThrow({ where: { id: need.id } })).status).toBe('COVERED');
  });
});

describe('المالية — funding_four_eyes', () => {
  it('أمين الصندوق يسجّل ولا يعتمد قيده؛ الرئيس يعتمد؛ الشاب 403', async () => {
    const treasurer = await createUser(['treasurer']);
    await actAs(treasurer.id);
    expect((await call(recordFunding, { body: { direction: 'INCOMING', amount: '100', occurredAt: '2026-09-02' } })).status).toBe(201);
    const record = await db.fundingRecord.findFirstOrThrow({ where: { recordedById: treasurer.id } });

    const president = await createUser(['council_president']);
    await actAs(president.id);
    const ledger = await call<{ records: { id: string; amount: string }[] }>(finance);
    expect(ledger.data.records.find((r) => r.id === record.id)?.amount).toBe('100');

    const presidentRecord = await call(recordFunding, { body: { direction: 'OUTGOING', amount: '5', occurredAt: '2026-09-03' } });
    if (presidentRecord.status === 201) {
      const own = await db.fundingRecord.findFirstOrThrow({ where: { recordedById: president.id } });
      const self = await call(approveFunding, { params: { id: own.id }, body: {} });
      expect(self.status).toBe(422);
      expect(self.error?.message_ar).toMatch(/سجّلته بنفسك/);
    }
    expect((await call(approveFunding, { params: { id: record.id }, body: {} })).status).toBe(200);

    const youth = await createUser(['youth']);
    await actAs(youth.id);
    expect((await call(finance)).status).toBe(403);
  });
});

describe('المهام — AC-05 · AC-06', () => {
  it('العضو ينقل حتى «مراجعة» ولا يعتمد مهمته؛ رئيس اللجنة يعتمد', async () => {
    const slug = 'logistical-support';
    const head = await createUser([{ key: 'committee_head', committee: slug }]);
    const member = await createUser([{ key: 'committee_member', committee: slug }]);
    await actAs(head.id);
    expect((await call(createTask, { body: { committeeId: await committeeId(slug), title: 'تجهيز القاعة', assigneeId: member.id } })).status).toBe(201);
    const task = await db.task.findFirstOrThrow({ where: { assigneeId: member.id } });

    await actAs(member.id);
    expect((await call<{ id: string }[]>(myTasks)).data.map((t) => t.id)).toContain(task.id);
    expect((await call(moveTask, { params: { id: task.id }, body: { toStatus: 'IN_PROGRESS' } })).status).toBe(200);
    expect((await call(moveTask, { params: { id: task.id }, body: { toStatus: 'REVIEW' } })).status).toBe(200);
    expect((await call(approveTask, { params: { id: task.id }, body: {} })).status).toBeGreaterThanOrEqual(403);

    await actAs(head.id);
    const board = await call<{ tasks: { id: string; canApprove: boolean }[] }>(committeeBoard, { params: { slug } });
    expect(board.data.tasks.find((t) => t.id === task.id)?.canApprove).toBe(true);
    expect((await call(approveTask, { params: { id: task.id }, body: {} })).status).toBe(200);
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('DONE');

    const outsider = await createUser([{ key: 'committee_head', committee: 'health-affairs' }]);
    await actAs(outsider.id);
    expect((await call(committeeBoard, { params: { slug } })).status).toBe(404);
  });
});

describe('الإشعارات واللوحات', () => {
  it('القائمة وغير المقروء وتعليمها؛ إشعار غيرك 404', async () => {
    const youth = await createUser(['youth']);
    const other = await createUser(['youth']);
    const mine = await db.notification.create({ data: { userId: youth.id, type: 'IDEA_DECIDED', title: 'إشعار تجريبي', channel: 'IN_APP' } });
    const theirs = await db.notification.create({ data: { userId: other.id, type: 'IDEA_DECIDED', title: 'إشعار غيرك', channel: 'IN_APP' } });
    await db.notification.create({ data: { userId: youth.id, type: 'IDEA_DECIDED', title: 'إشعار ثانٍ', channel: 'IN_APP' } });

    await actAs(youth.id);
    const list = await call<{ items: { id: string }[]; unread: number }>(notifications);
    expect(list.data.unread).toBe(2);
    expect((await call<{ unread: number }>(meDashboard)).data.unread).toBe(2);
    expect((await call(readOne, { params: { id: theirs.id }, body: {} })).status).toBe(404);
    expect((await call(readOne, { params: { id: mine.id }, body: {} })).status).toBe(200);
    expect((await call(readAll, { body: {} })).status).toBe(200);
    expect((await call<{ unreadCount: number }>(session)).data.unreadCount).toBe(0);
  });

  it('لوحة المجلس: الشاب يرى عدّادات فارغة لا عدّادات المجلس', async () => {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    const res = await call<{ triage: boolean; newCount: number | null }>(adminDashboard);
    expect(res.data).toMatchObject({ triage: false, newCount: null });
  });
});

describe('التدقيق والأدوار — AC-16 · AC-19', () => {
  it('الشاب 403 على السجل؛ الرئيس يقرؤه ومعرّف السطر نص', async () => {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    expect((await call(audit)).status).toBe(403);
    const president = await createUser(['council_president']);
    await actAs(president.id);
    const res = await call<{ items: { id: unknown }[] }>(audit);
    expect(res.status).toBe(200);
    expect(typeof res.data.items[0]?.id).toBe('string');
  });

  it('تعيين دور ثم سحبه — يسري في الطلب التالي', async () => {
    const president = await createUser(['council_president']);
    const target = await createUser(['youth']);
    const role = await db.role.findUniqueOrThrow({ where: { key: 'committee_member' } });

    const youth = await createUser(['youth']);
    await actAs(youth.id);
    expect((await call(users)).status).toBe(403);

    await actAs(president.id);
    const assigned = await call(assignRole, {
      params: { id: target.id },
      body: { roleId: role.id, committeeId: await committeeId('sports-arts') },
    });
    expect(assigned.status).toBe(200);
    const assignment = await db.roleAssignment.findFirstOrThrow({ where: { userId: target.id, roleId: role.id } });

    await actAs(target.id);
    expect((await call<{ landingPath: string }>(session)).data.landingPath).toBe('/admin');

    await actAs(president.id);
    expect((await call(revokeRole, { params: { id: assignment.id }, body: {} })).status).toBe(200);
    await actAs(target.id);
    expect((await call<{ landingPath: string }>(session)).data.landingPath).toBe('/me');
  });
});
