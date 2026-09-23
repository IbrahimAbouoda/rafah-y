'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission, requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { writeAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { StartTermSchema } from '@/lib/validation/settings';

/**
 * AC-16 ③: الدورة الجديدة تصبح الحالية، فتتوقف أدوار الدورة السابقة المرتبطة بدورة تلقائيًا
 * (activeAssignmentsWhere يشترط term.isCurrent) — دون حذف أي تعيين أو بيان.
 */
export async function startTermAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'users:manage_roles');
    const data = StartTermSchema.parse(formToObject(form));
    requirePermission(user, 'users:manage_roles', {});

    await db.$transaction(async (tx) => {
      const previous = await tx.councilTerm.findFirst({ where: { isCurrent: true } });
      if (previous) {
        await tx.councilTerm.update({
          where: { id: previous.id },
          data: { isCurrent: false, endsAt: previous.endsAt ?? data.startsAt },
        });
      }
      const term = await tx.councilTerm.create({
        data: { name: data.name, startsAt: data.startsAt, endsAt: data.endsAt ?? null, isCurrent: true },
      });
      await writeAudit(tx, user, 'term.change', 'CouncilTerm', term.id, previous, term);
    });

    revalidatePath('/admin/settings/terms');
    return `بدأت الدورة «${data.name}». أدوار الدورة السابقة لم تعد فعّالة — عيّن أعضاء الدورة الجديدة من صفحة المستخدمين.`;
  });
}
