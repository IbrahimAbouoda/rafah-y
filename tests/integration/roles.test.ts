import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { can } from '@/lib/rbac';
import { assignRoleAction, revokeRoleAction } from '@/server/actions/settings/roles';
import { actAs, committeeId, createUser, form, session } from '../support/factories';

// AC-16 — تعيين الأدوار وسحبها

const roleId = async (key: string) => (await db.role.findUniqueOrThrow({ where: { key } })).id;

describe('assignRoleAction', () => {
  let president: Awaited<ReturnType<typeof createUser>>;
  beforeEach(async () => {
    president = await createUser(['council_president']);
    await actAs(president.id);
  });

  it('يعيّن عضو لجنة ويكتب role.assign بلقطة أدوار المنفّذ في نفس المعاملة', async () => {
    const target = await createUser(['youth']);
    const legal = await committeeId('legal-affairs');
    const res = await assignRoleAction(null, form({ userId: target.id, roleId: await roleId('committee_member'), committeeId: legal }));
    expect(res).toMatchObject({ ok: true });

    const assignment = await db.roleAssignment.findFirstOrThrow({ where: { userId: target.id, committeeId: legal } });
    expect(assignment.assignedById).toBe(president.id);
    expect(assignment.termId).not.toBeNull();

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'role.assign', entityId: assignment.id } });
    expect(audit.actorId).toBe(president.id);
    expect(audit.actorRoles).toEqual(['council_president']);
    expect(audit.after).toMatchObject({ committeeId: legal, roleKey: 'committee_member' });

    expect(can(await session(target.id), 'tasks:read', { committeeId: legal })).toBe(true);
  });

  it('يرفض دورًا يتطلب لجنة بلا لجنة (AC-16 ①) ولا يكتب شيئًا', async () => {
    const target = await createUser();
    const before = await db.auditLog.count();
    const res = await assignRoleAction(null, form({ userId: target.id, roleId: await roleId('committee_head') }));
    expect(res).toMatchObject({ ok: false, fieldErrors: { committeeId: expect.any(Array) } });
    expect(res?.message).toMatch(/يتطلب لجنة/);
    expect(await db.roleAssignment.count({ where: { userId: target.id } })).toBe(0);
    expect(await db.auditLog.count()).toBe(before);
  });

  it('يرفض لجنة لدور لا يرتبط بلجنة', async () => {
    const target = await createUser();
    const res = await assignRoleAction(
      null,
      form({ userId: target.id, roleId: await roleId('secretary'), committeeId: await committeeId('health-affairs') }),
    );
    expect(res).toMatchObject({ ok: false, fieldErrors: { committeeId: expect.any(Array) } });
  });

  it('يرفض تعيينًا مكررًا فعّالًا', async () => {
    const target = await createUser(['secretary']);
    const res = await assignRoleAction(null, form({ userId: target.id, roleId: await roleId('secretary') }));
    expect(res).toMatchObject({ ok: false });
    expect(res?.message).toMatch(/بالفعل/);
  });

  it('يرفض تاريخ انتهاء في الماضي', async () => {
    const target = await createUser();
    const res = await assignRoleAction(null, form({ userId: target.id, roleId: await roleId('secretary'), endsAt: '2020-01-01' }));
    expect(res).toMatchObject({ ok: false, fieldErrors: { endsAt: expect.any(Array) } });
  });

  it('يرفض مدخلات غير صالحة برسالة عربية لكل حقل', async () => {
    const res = await assignRoleAction(null, form({ userId: 'x', roleId: '' }));
    expect(res?.ok).toBe(false);
    expect(res?.fieldErrors?.userId?.[0]).toMatch(/[؀-ۿ]/);
    expect(res?.fieldErrors?.roleId?.[0]).toMatch(/[؀-ۿ]/);
  });
});

describe('رفض غير المخوَّل', () => {
  it.each(['youth', 'secretary', 'vice_president', 'municipality_observer', 'committee_head'] as const)(
    '%s لا يعيّن أدوارًا ولا يسحبها — والرفض قبل معالجة المدخلات',
    async (key) => {
      const actor = await createUser(key === 'committee_head' ? [{ key, committee: 'legal-affairs' }] : [key]);
      await actAs(actor.id);
      const target = await createUser();

      const assign = await assignRoleAction(null, form({ userId: target.id, roleId: await roleId('council_president') }));
      expect(assign).toMatchObject({ ok: false });
      expect(assign?.message).toMatch(/لا تملك صلاحية/);

      // مدخلات فاسدة: الرفض يأتي من الصلاحية لا من Zod
      const garbage = await assignRoleAction(null, form({ userId: 'not-a-uuid' }));
      expect(garbage?.message).toMatch(/لا تملك صلاحية/);
      expect(garbage?.fieldErrors).toBeUndefined();

      expect(await db.roleAssignment.count({ where: { userId: target.id } })).toBe(0);
    },
  );

  it('غير المسجّل يُرفض', async () => {
    await actAs(null);
    const res = await assignRoleAction(null, form({}));
    expect(res?.message).toMatch(/سجّل الدخول/);
  });

  it('المدير التقني يعيّن الأدوار (users:manage_roles بنطاق الكل)', async () => {
    const admin = await createUser(['super_admin']);
    await actAs(admin.id);
    const target = await createUser();
    expect(await assignRoleAction(null, form({ userId: target.id, roleId: await roleId('secretary') }))).toMatchObject({ ok: true });
  });
});

describe('revokeRoleAction', () => {
  it('يسحب الدور فيسري في الطلب التالي (AC-16 ②) ويكتب role.revoke', async () => {
    const president = await createUser(['council_president']);
    await actAs(president.id);
    const target = await createUser(['secretary']);
    expect(can(await session(target.id), 'complaints:triage')).toBe(true);

    const assignment = await db.roleAssignment.findFirstOrThrow({ where: { userId: target.id } });
    expect(await revokeRoleAction(null, form({ assignmentId: assignment.id }))).toMatchObject({ ok: true });

    expect(can(await session(target.id), 'complaints:triage')).toBe(false);
    const row = await db.roleAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(row.revokedById).toBe(president.id);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'role.revoke', entityId: assignment.id } });
    expect(audit.before).toMatchObject({ revokedAt: null });
    expect(audit.after).toMatchObject({ revokedById: president.id });
  });

  it('يرفض سحب دور من النفس', async () => {
    const president = await createUser(['council_president']);
    await actAs(president.id);
    const own = await db.roleAssignment.findFirstOrThrow({ where: { userId: president.id } });
    const res = await revokeRoleAction(null, form({ assignmentId: own.id }));
    expect(res?.message).toMatch(/من نفسك/);
    expect((await db.roleAssignment.findUniqueOrThrow({ where: { id: own.id } })).revokedAt).toBeNull();
  });

  it('يرفض سحب دور مسحوب', async () => {
    const president = await createUser(['council_president']);
    await actAs(president.id);
    const target = await createUser([{ key: 'secretary', revoked: true }]);
    const a = await db.roleAssignment.findFirstOrThrow({ where: { userId: target.id } });
    expect((await revokeRoleAction(null, form({ assignmentId: a.id })))?.message).toMatch(/مسحوب بالفعل/);
  });
});
