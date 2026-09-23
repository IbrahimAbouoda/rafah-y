'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission, requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { invalid, notFound } from '@/lib/errors';
import { AreaSchema, CategorySchema, CommitteeSchema } from '@/lib/validation/settings';

// اللجان والتصنيفات والمناطق — كل تغيير يُسجَّل settings.change (PRD §6.9)

export async function saveCommitteeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'committees:manage');
    const data = CommitteeSchema.parse(formToObject(form));
    const { id, ...fields } = data;
    const values = { ...fields, mandate: fields.mandate ?? null };

    const before = id ? await db.committee.findUnique({ where: { id } }) : null;
    if (id && !before) throw notFound('اللجنة');
    requirePermission(user, 'committees:manage', { committeeId: id ?? null });

    await db.$transaction(async (tx) => {
      const saved = id
        ? await tx.committee.update({ where: { id }, data: values })
        : await tx.committee.create({ data: values });
      await writeAudit(tx, user, 'settings.change', 'Committee', saved.id, before, saved);
    });

    revalidatePath('/admin/settings/committees');
    return id ? `حُفظت تعديلات «${data.nameAr}».` : `أُضيفت «${data.nameAr}».`;
  });
}

export async function saveCategoryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'settings:manage');
    const data = CategorySchema.parse(formToObject(form));
    const { id, ...fields } = data;
    const values = { ...fields, defaultCommitteeId: fields.defaultCommitteeId ?? null };

    const before = id ? await db.complaintCategory.findUnique({ where: { id } }) : null;
    if (id && !before) throw notFound('التصنيف');
    if (values.defaultCommitteeId) {
      const committee = await db.committee.findFirst({ where: { id: values.defaultCommitteeId, isActive: true } });
      if (!committee) throw invalid('اللجنة المقترحة غير نشطة. اختر لجنة نشطة.', { defaultCommitteeId: ['لجنة غير نشطة.'] });
    }
    requirePermission(user, 'settings:manage', {});

    await db.$transaction(async (tx) => {
      const saved = id
        ? await tx.complaintCategory.update({ where: { id }, data: values })
        : await tx.complaintCategory.create({ data: values });
      await writeAudit(tx, user, 'settings.change', 'ComplaintCategory', saved.id, before, saved);
    });

    revalidatePath('/admin/settings/categories');
    return id ? `حُفظ تصنيف «${data.nameAr}».` : `أُضيف تصنيف «${data.nameAr}».`;
  });
}

export async function saveAreaAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'settings:manage');
    const data = AreaSchema.parse(formToObject(form));
    const { id, ...fields } = data;
    const values = { nameAr: fields.nameAr, parentId: fields.parentId ?? null };

    const before = id ? await db.area.findUnique({ where: { id } }) : null;
    if (id && !before) throw notFound('المنطقة');

    // منع الحلقة: المنطقة لا تكون أمًّا لنفسها ولا لإحدى أمهاتها
    if (id && values.parentId) {
      let cursor: string | null = values.parentId;
      for (let depth = 0; cursor && depth < 50; depth++) {
        if (cursor === id) {
          throw invalid('لا يمكن جعل المنطقة تابعة لنفسها أو لمنطقة تتبعها.', { parentId: ['اختيار يصنع حلقة.'] });
        }
        const parent: { parentId: string | null } | null = await db.area.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
        cursor = parent?.parentId ?? null;
      }
    }
    requirePermission(user, 'settings:manage', {});

    await db.$transaction(async (tx) => {
      const saved = id ? await tx.area.update({ where: { id }, data: values }) : await tx.area.create({ data: values });
      await writeAudit(tx, user, 'settings.change', 'Area', saved.id, before, saved);
    });

    revalidatePath('/admin/settings/areas');
    return id ? `حُفظت منطقة «${data.nameAr}».` : `أُضيفت منطقة «${data.nameAr}».`;
  });
}
