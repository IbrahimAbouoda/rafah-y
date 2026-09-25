'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission, requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { PARTNER_ROLE_KEY } from '@/lib/config';
import { db } from '@/lib/db';
import { conflict, invalid, notFound } from '@/lib/errors';
import { activeAssignmentsWhere } from '@/lib/session';
import {
  InteractionSchema,
  LinkMemberSchema,
  OrganizationSchema,
  OrganizationStageSchema,
  UnlinkMemberSchema,
} from '@/lib/validation/initiatives';

// المؤسسات — CRM (§4.8) · D26: ربط ممثل المؤسسة بحسابه يمنحه دور partner، وكل ربط وفكّ بسطر تدقيق.

function revalidateOrg(id?: string) {
  revalidatePath('/admin/organizations');
  if (id) revalidatePath(`/admin/organizations/${id}`);
}

/** organizations:manage — إضافة مؤسسة أو تعديلها */
export async function saveOrganizationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'organizations:manage');
    const data = OrganizationSchema.parse(formToObject(form));
    requirePermission(user, 'organizations:manage', {});
    const fields = {
      name: data.name,
      type: data.type,
      country: data.country ?? null,
      sectors: data.sectors,
      website: data.website ?? null,
    };
    if (data.id) {
      const existing = await db.organization.findUnique({ where: { id: data.id }, select: { id: true } });
      if (!existing) throw notFound('المؤسسة');
      await db.organization.update({ where: { id: data.id }, data: fields });
      revalidateOrg(data.id);
      return 'حُفظت بيانات المؤسسة.';
    }
    const created = await db.organization.create({ data: { ...fields, ownerId: user.id }, select: { id: true } });
    revalidateOrg(created.id);
    return 'أُضيفت المؤسسة.';
  });
}

/** organizations:manage — مرحلة الشراكة */
export async function setOrganizationStageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'organizations:manage');
    const data = OrganizationStageSchema.parse(formToObject(form));
    const org = await db.organization.findUnique({ where: { id: data.organizationId }, select: { id: true } });
    if (!org) throw notFound('المؤسسة');
    requirePermission(user, 'organizations:manage', {});
    await db.organization.update({ where: { id: org.id }, data: { stage: data.stage } });
    revalidateOrg(org.id);
    return 'حُدّثت مرحلة الشراكة.';
  });
}

/** organizations:log («خاص»: يُسجَّل باسم من كتبه) — اتصال، اجتماع، إرسال مقترح… */
export async function logInteractionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'organizations:log');
    const data = InteractionSchema.parse(formToObject(form));
    const org = await db.organization.findUnique({ where: { id: data.organizationId }, select: { id: true, lastContactAt: true } });
    if (!org) throw notFound('المؤسسة');
    requirePermission(user, 'organizations:log', { ownerId: user.id });
    if (data.occurredAt > new Date()) throw invalid('تاريخ التواصل في المستقبل.', { occurredAt: ['تاريخ في المستقبل.'] });
    if (data.followUpAt && data.followUpAt <= new Date()) {
      throw invalid('موعد المتابعة يجب أن يكون في المستقبل.', { followUpAt: ['تاريخ في الماضي.'] });
    }
    await db.$transaction(async (tx) => {
      await tx.interaction.create({
        data: {
          organizationId: org.id,
          type: data.type,
          summary: data.summary,
          occurredAt: data.occurredAt,
          followUpAt: data.followUpAt ?? null,
          loggedById: user.id,
        },
      });
      if (!org.lastContactAt || data.occurredAt > org.lastContactAt) {
        await tx.organization.update({ where: { id: org.id }, data: { lastContactAt: data.occurredAt } });
      }
    });
    revalidateOrg(org.id);
    return 'سُجّل التواصل.';
  });
}

/** D26 — ربط حساب مسجّل بالمؤسسة، ومنحه دور partner إن لم يكن يحمله */
export async function linkMemberAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'organizations:manage');
    const data = LinkMemberSchema.parse(formToObject(form));
    const [org, member, role] = await Promise.all([
      db.organization.findUnique({ where: { id: data.organizationId }, select: { id: true, name: true } }),
      db.user.findFirst({ where: { email: data.email, isActive: true }, select: { id: true, fullName: true } }),
      db.role.findUniqueOrThrow({ where: { key: PARTNER_ROLE_KEY } }),
    ]);
    if (!org) throw notFound('المؤسسة');
    if (!member) {
      throw invalid('لا حساب بهذا البريد. اطلب من ممثل المؤسسة إنشاء حساب من /register أولًا.', { email: ['لا حساب بهذا البريد.'] });
    }
    requirePermission(user, 'organizations:manage', {});
    const existing = await db.partnerMembership.findUnique({
      where: { userId_organizationId: { userId: member.id, organizationId: org.id } },
    });
    if (existing) throw conflict('هذا الحساب مربوط بالمؤسسة بالفعل.');

    await db.$transaction(async (tx) => {
      await tx.partnerMembership.create({ data: { userId: member.id, organizationId: org.id, isAdmin: data.isAdmin } });
      const hasRole = await tx.roleAssignment.findFirst({ where: { ...activeAssignmentsWhere(member.id), roleId: role.id } });
      const assignment = hasRole ?? (await tx.roleAssignment.create({ data: { userId: member.id, roleId: role.id, assignedById: user.id } }));
      await writeAudit(tx, user, 'role.assign', 'RoleAssignment', assignment.id, null, {
        roleKey: PARTNER_ROLE_KEY,
        userId: member.id,
        organizationId: org.id,
        membership: 'linked',
        newRole: !hasRole,
      });
    });
    revalidateOrg(org.id);
    return `رُبط ${member.fullName} بمؤسسة ${org.name}، ويدخل الآن بوابة المؤسسات.`;
  });
}

/** D26 — فكّ الربط؛ يُسحب دور partner حين لا تبقى له مؤسسة */
export async function unlinkMemberAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'organizations:manage');
    const data = UnlinkMemberSchema.parse(formToObject(form));
    const membership = await db.partnerMembership.findUnique({
      where: { userId_organizationId: { userId: data.userId, organizationId: data.organizationId } },
    });
    if (!membership) throw notFound('الربط');
    requirePermission(user, 'organizations:manage', {});

    await db.$transaction(async (tx) => {
      await tx.partnerMembership.delete({ where: { userId_organizationId: { userId: data.userId, organizationId: data.organizationId } } });
      const remaining = await tx.partnerMembership.count({ where: { userId: data.userId } });
      const assignment = await tx.roleAssignment.findFirst({
        where: { ...activeAssignmentsWhere(data.userId), role: { key: PARTNER_ROLE_KEY } },
      });
      if (remaining === 0 && assignment) {
        await tx.roleAssignment.update({ where: { id: assignment.id }, data: { revokedAt: new Date(), revokedById: user.id } });
      }
      await writeAudit(tx, user, 'role.revoke', 'RoleAssignment', assignment?.id ?? data.userId, membership, {
        membership: 'unlinked',
        organizationId: data.organizationId,
        roleRevoked: remaining === 0 && !!assignment,
      });
    });
    revalidateOrg(data.organizationId);
    return 'فُكّ الربط. يسري ذلك من الطلب التالي للمستخدم.';
  });
}
