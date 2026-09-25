import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { can } from '@/lib/rbac';
import { submitComplaintAction } from '@/server/actions/complaints/submit';
import { assignToCommitteeAction, openForTriageAction } from '@/server/actions/complaints/workflow';
import {
  approveTaskAction,
  commentTaskAction,
  createTaskAction,
  moveTaskAction,
  reassignTaskAction,
} from '@/server/actions/tasks';
import { actAs, categoryId, committeeId, createUser, form, freshIp, session } from '../support/factories';

// Sprint 2 — مهام اللجان: AC-05 · AC-06 · معيار الإنجاز «العضو لا يعتمد مهمته، ورئيس اللجنة لا يرى لجنة غيره»

async function committeeTeam(slug: string) {
  const id = await committeeId(slug);
  const head = await createUser([{ key: 'committee_head', committee: slug }], 'رئيس لجنة');
  const member = await createUser([{ key: 'committee_member', committee: slug }], 'عضو');
  return { id, slug, head, member };
}

async function newTask(team: Awaited<ReturnType<typeof committeeTeam>>, extra: Record<string, string> = {}) {
  await actAs(team.head.id);
  const res = await createTaskAction(
    null,
    form({ committeeId: team.id, title: 'متابعة إصلاح الإنارة', assigneeId: team.member.id, priority: 'HIGH', ...extra }),
  );
  expect(res).toMatchObject({ ok: true });
  return db.task.findFirstOrThrow({ where: { committeeId: team.id, assigneeId: team.member.id }, orderBy: { createdAt: 'desc' } });
}

async function assignedComplaint(slug: string) {
  freshIp();
  const youth = await createUser(['youth']);
  await actAs(youth.id);
  const res = await submitComplaintAction({
    clientDraftId: randomUUID(),
    title: 'شكوى لمهمة',
    body: 'تفاصيل كافية لشكوى ستتحول إلى مهمة لدى اللجنة.',
    categoryId: await categoryId(),
  });
  const secretary = await createUser(['secretary']);
  await actAs(secretary.id);
  await openForTriageAction(null, form({ complaintId: res!.data!.id }));
  await assignToCommitteeAction(null, form({ complaintId: res!.data!.id, committeeId: await committeeId(slug) }));
  return res!.data!.id;
}

describe('createTask — AC-05', () => {
  it('رئيس اللجنة ينشئ مهمة من شكوى لجنته ويسندها لعضو: TODO + task.assign + إشعار للعضو', async () => {
    const team = await committeeTeam('health-affairs');
    const complaintId = await assignedComplaint('health-affairs');
    const task = await newTask(team, { complaintId });
    expect(task).toMatchObject({ status: 'TODO', complaintId, createdById: team.head.id, priority: 'HIGH' });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'task.assign', entityId: task.id } });
    expect(audit.actorId).toBe(team.head.id);
    expect(await db.notification.count({ where: { userId: team.member.id, type: 'TASK_ASSIGNED' } })).toBe(2);
  });

  it('① الإسناد لعضو خارج اللجنة مرفوض', async () => {
    const team = await committeeTeam('sports-arts');
    const outsider = await createUser([{ key: 'committee_member', committee: 'legal-affairs' }]);
    await actAs(team.head.id);
    const res = await createTaskAction(null, form({ committeeId: team.id, title: 'مهمة', assigneeId: outsider.id }));
    expect(res).toMatchObject({ ok: false, fieldErrors: { assigneeId: expect.any(Array) } });
  });

  it('عضو مسحوب دوره ليس عضوًا — الإسناد إليه مرفوض', async () => {
    const team = await committeeTeam('sports-arts');
    const revoked = await createUser([{ key: 'committee_member', committee: 'sports-arts', revoked: true }]);
    await actAs(team.head.id);
    expect(await createTaskAction(null, form({ committeeId: team.id, title: 'مهمة', assigneeId: revoked.id }))).toMatchObject({ ok: false });
  });

  it('رئيس لجنة أخرى لا ينشئ مهمة في لجنة غيره · العضو لا ينشئ مهام', async () => {
    const team = await committeeTeam('women-empowerment');
    const other = await committeeTeam('health-affairs');
    for (const actor of [other.head, team.member]) {
      await actAs(actor.id);
      const res = await createTaskAction(null, form({ committeeId: team.id, title: 'مهمة', assigneeId: team.member.id }));
      expect(res).toMatchObject({ ok: false, message: expect.stringMatching(/لا تملك صلاحية/) });
    }
  });

  it('مهمة من شكوى محوّلة للجنة أخرى مرفوضة', async () => {
    const team = await committeeTeam('logistical-support');
    const complaintId = await assignedComplaint('health-affairs');
    await actAs(team.head.id);
    const res = await createTaskAction(null, form({ committeeId: team.id, title: 'مهمة', assigneeId: team.member.id, complaintId }));
    expect(res).toMatchObject({ ok: false, message: expect.stringMatching(/ليست محوّلة/) });
  });
});

describe('تنفيذ المهمة واعتمادها — AC-06', () => {
  it('العضو ينقل مهمته حتى REVIEW، والرئيس يعتمدها، وتُسجَّل في سجل الشكوى (④)', async () => {
    const team = await committeeTeam('legal-affairs');
    const complaintId = await assignedComplaint('legal-affairs');
    const task = await newTask(team, { complaintId });

    await actAs(team.member.id);
    expect(await moveTaskAction(null, form({ taskId: task.id, toStatus: 'IN_PROGRESS' }))).toMatchObject({ ok: true });
    expect(await commentTaskAction(null, form({ taskId: task.id, body: 'تواصلت مع البلدية.' }))).toMatchObject({ ok: true });
    expect(await moveTaskAction(null, form({ taskId: task.id, toStatus: 'REVIEW' }))).toMatchObject({ ok: true });

    await actAs(team.head.id);
    expect(await approveTaskAction(null, form({ taskId: task.id }))).toMatchObject({ ok: true });
    const done = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(done).toMatchObject({ status: 'DONE', approvedById: team.head.id });
    expect(await db.auditLog.count({ where: { action: 'task.approve', entityId: task.id } })).toBe(1);

    const event = await db.complaintEvent.findFirstOrThrow({ where: { complaintId, note: { contains: task.title } } });
    expect(event).toMatchObject({ isPublic: false, actorId: team.head.id });
  });

  it('② العضو لا ينقل مهمته إلى DONE ولا يستدعي الاعتماد — الخادم يرفض', async () => {
    const team = await committeeTeam('technology-digital-systems');
    const task = await newTask(team);
    await db.task.update({ where: { id: task.id }, data: { status: 'REVIEW' } });
    await actAs(team.member.id);
    expect(await moveTaskAction(null, form({ taskId: task.id, toStatus: 'DONE' }))).toMatchObject({ ok: false });
    expect(await approveTaskAction(null, form({ taskId: task.id }))).toMatchObject({ ok: false, message: expect.stringMatching(/لا تملك صلاحية/) });
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('REVIEW');
  });

  it('لا اعتماد ذاتي حتى لمن يملك tasks:approve: رئيس اللجنة المسند إليه يُرفض', async () => {
    const team = await committeeTeam('public-relations-media');
    await actAs(team.head.id);
    await createTaskAction(null, form({ committeeId: team.id, title: 'مهمة الرئيس نفسه', assigneeId: team.head.id }));
    const task = await db.task.findFirstOrThrow({ where: { assigneeId: team.head.id } });
    await db.task.update({ where: { id: task.id }, data: { status: 'REVIEW' } });
    expect(await approveTaskAction(null, form({ taskId: task.id }))).toMatchObject({ ok: false, message: expect.stringMatching(/مسندة إليك/) });
  });

  it('③ وقاعدة البيانات نفسها ترفض الاعتماد الذاتي لو تجاوز أحد التطبيق', async () => {
    const team = await committeeTeam('organizations-partnerships');
    const task = await newTask(team);
    await expect(
      db.task.update({ where: { id: task.id }, data: { status: 'DONE', approvedById: team.member.id } }),
    ).rejects.toThrow(/tasks_no_self_approval/);
  });

  it('العضو لا يحرّك مهمة زميله، ورئيس لجنة أخرى لا يصل لمهام اللجنة', async () => {
    const team = await committeeTeam('logistical-support');
    const colleague = await createUser([{ key: 'committee_member', committee: 'logistical-support' }]);
    const other = await committeeTeam('sports-arts');
    const task = await newTask(team);
    for (const actor of [colleague, other.head]) {
      await actAs(actor.id);
      expect(await moveTaskAction(null, form({ taskId: task.id, toStatus: 'IN_PROGRESS' }))).toMatchObject({ ok: false });
    }
    await actAs(other.head.id);
    expect(await commentTaskAction(null, form({ taskId: task.id, body: 'تعليق' }))).toMatchObject({ ok: false });
    // معيار الإنجاز: رئيس اللجنة لا يرى لجنة غيره
    expect(can(await session(other.head.id), 'tasks:read', { committeeId: team.id })).toBe(false);
    expect(can(await session(other.head.id), 'committees:read', { committeeId: team.id })).toBe(false);
  });

  it('إعادة الإسناد: من الرئيس لعضو في اللجنة، مع task.assign', async () => {
    const team = await committeeTeam('women-empowerment');
    const second = await createUser([{ key: 'committee_member', committee: 'women-empowerment' }]);
    const task = await newTask(team);
    await actAs(team.member.id);
    expect(await reassignTaskAction(null, form({ taskId: task.id, assigneeId: second.id }))).toMatchObject({ ok: false });
    await actAs(team.head.id);
    expect(await reassignTaskAction(null, form({ taskId: task.id, assigneeId: second.id }))).toMatchObject({ ok: true });
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).assigneeId).toBe(second.id);
    expect(await db.auditLog.count({ where: { action: 'task.assign', entityId: task.id } })).toBe(2);
  });
});
