'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission, requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { conflict, invalid, notFound } from '@/lib/errors';
import { activeAssignmentsWhere } from '@/lib/session';
import { AssignRoleSchema, RevokeRoleSchema } from '@/lib/validation/settings';

// AC-16 — تعيين الأدوار وسحبها

export async function assignRoleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'users:manage_roles');
    const data = AssignRoleSchema.parse(formToObject(form));

    const [target, role] = await Promise.all([
      db.user.findFirst({ where: { id: data.userId, isActive: true } }),
      db.role.findUnique({ where: { id: data.roleId } }),
    ]);
    if (!target) throw notFound('المستخدم');
    if (!role) throw notFound('الدور');

    if (role.requiresCommittee && !data.committeeId) {
      throw invalid('هذا الدور يتطلب لجنة. اختر اللجنة ثم احفظ.', { committeeId: ['اختر اللجنة.'] });
    }
    if (!role.requiresCommittee && data.committeeId) {
      throw invalid('هذا الدور لا يرتبط بلجنة. اترك حقل اللجنة فارغًا.', { committeeId: ['اتركه فارغًا لهذا الدور.'] });
    }
    if (data.committeeId) {
      const committee = await db.committee.findFirst({ where: { id: data.committeeId, isActive: true } });
      if (!committee) throw invalid('اللجنة غير موجودة أو معطّلة. اختر لجنة نشطة.', { committeeId: ['لجنة غير نشطة.'] });
    }
    if (data.endsAt && data.endsAt <= new Date()) {
      throw invalid('تاريخ الانتهاء يجب أن يكون في المستقبل.', { endsAt: ['تاريخ في الماضي.'] });
    }

    let termId: string | null = null;
    if (role.isTermBound) {
      const term = await db.councilTerm.findFirst({ where: { isCurrent: true } });
      if (!term) throw invalid('لا توجد دورة مجلس حالية. أنشئ دورة من صفحة «دورات المجلس» أولًا.');
      termId = term.id;
    }

    requirePermission(user, 'users:manage_roles', { committeeId: data.committeeId });

    const duplicate = await db.roleAssignment.findFirst({
      where: { ...activeAssignmentsWhere(target.id), roleId: role.id, committeeId: data.committeeId ?? null },
    });
    if (duplicate) throw conflict('المستخدم يحمل هذا الدور في نفس اللجنة بالفعل.');

    await db.$transaction(async (tx) => {
      const assignment = await tx.roleAssignment.create({
        data: {
          userId: target.id,
          roleId: role.id,
          committeeId: data.committeeId ?? null,
          termId,
          title: data.title ?? null,
          endsAt: data.endsAt ?? null,
          assignedById: user.id,
        },
      });
      await writeAudit(tx, user, 'role.assign', 'RoleAssignment', assignment.id, null, {
        ...assignment,
        roleKey: role.key,
      });
    });

    revalidatePath('/admin/settings/users');
    return `عُيّن دور «${role.nameAr}» للمستخدم ${target.fullName}.`;
  });
}

export async function revokeRoleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'users:manage_roles');
    const data = RevokeRoleSchema.parse(formToObject(form));

    const assignment = await db.roleAssignment.findUnique({
      where: { id: data.assignmentId },
      include: { role: { select: { key: true, nameAr: true } } },
    });
    if (!assignment) throw notFound('التعيين');
    requirePermission(user, 'users:manage_roles', { committeeId: assignment.committeeId });

    if (assignment.revokedAt) throw conflict('هذا الدور مسحوب بالفعل.');
    if (assignment.userId === user.id) {
      throw invalid('لا يمكنك سحب دور من نفسك. اطلب ذلك من شخص آخر يملك صلاحية تعيين الأدوار.');
    }

    await db.$transaction(async (tx) => {
      const updated = await tx.roleAssignment.update({
        where: { id: assignment.id },
        data: { revokedAt: new Date(), revokedById: user.id },
      });
      await writeAudit(tx, user, 'role.revoke', 'RoleAssignment', updated.id, assignment, updated);
    });

    revalidatePath('/admin/settings/users');
    return `سُحب دور «${assignment.role.nameAr}». يسري ذلك من الطلب التالي للمستخدم.`;
  });
}
