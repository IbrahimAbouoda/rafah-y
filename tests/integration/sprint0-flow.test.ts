import { randomUUID } from 'node:crypto';
import type { User as AuthUser } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { provisionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { can } from '@/lib/rbac';
import { assignRoleAction } from '@/server/actions/settings/roles';
import { actAs, committeeId, createUser, form, session } from '../support/factories';

/**
 * معيار إنجاز Sprint 0 (PRD §15 · قرار D2):
 * مستخدم يسجّل، الرئيس يعيّنه عضو لجنة، والإجراء يظهر في سجل التدقيق.
 * التسجيل عبر Supabase يُمثَّل بحساب مصادقة وهمي؛ كل ما بعده هو الكود الفعلي.
 */
describe('Sprint 0 — المسار السعيد', () => {
  it('تسجيل ← تعيين عضو لجنة ← سطران في سجل التدقيق', async () => {
    const authUser = {
      id: randomUUID(),
      email: `new-${randomUUID().slice(0, 6)}@example.test`,
      user_metadata: { full_name: 'شاب تجريبي' },
    } as unknown as AuthUser;

    // 1) التسجيل: سجل User + دور الشاب + role.assign من النظام
    const userId = await provisionUser(authUser);
    expect(await provisionUser(authUser)).toBe(userId); // تكرار الاستدعاء لا ينشئ حسابًا ثانيًا
    const youth = await session(userId);
    expect(youth.roles.map((r) => r.key)).toEqual(['youth']);
    const signupAudit = await db.auditLog.findFirstOrThrow({
      where: { action: 'role.assign', after: { path: ['userId'], equals: userId } },
    });
    expect(signupAudit.actorId).toBeNull();
    expect(signupAudit.actorRoles).toEqual(['system:signup']);

    // 2) الرئيس يعيّنه عضوًا في لجنة الأنشطة والمبادرات
    const president = await createUser(['council_president'], 'رئيس تجريبي');
    await actAs(president.id);
    const committee = await committeeId('activities-initiatives');
    const role = await db.role.findUniqueOrThrow({ where: { key: 'committee_member' } });
    const res = await assignRoleAction(null, form({ userId, roleId: role.id, committeeId: committee }));
    expect(res).toMatchObject({ ok: true });

    // 3) الإجراء في سجل التدقيق باسم الرئيس ولقطة دوره
    const assignment = await db.roleAssignment.findFirstOrThrow({ where: { userId, roleId: role.id } });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'role.assign', entityId: assignment.id } });
    expect(audit).toMatchObject({ actorId: president.id, actorRoles: ['council_president'], entityType: 'RoleAssignment' });

    // والعضوية نافذة في الطلب التالي
    const member = await session(userId);
    expect(can(member, 'tasks:read', { committeeId: committee })).toBe(true);
    expect(can(member, 'tasks:approve', { committeeId: committee })).toBe(false);
  });
});
