'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission, requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { db } from '@/lib/db';
import { runDemoPurge } from '@/lib/demo-data';
import { PurgeDemoSchema } from '@/lib/validation/settings';

// system/purgeDemoData — AC-20 · Sprint 6. التشغيل المعتمد من سطر الأوامر (npm run admin:purge-demo)؛
// الإجراء نفسه بالمنطق نفسه (lib/demo-data.ts) لمن يملك settings:manage، بتأكيد صريح وسطر settings.change.
export async function purgeDemoDataAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    requirePermission(user, 'settings:manage');
    PurgeDemoSchema.parse(formToObject(form));
    requirePermission(user, 'settings:manage', {});

    const total = await runDemoPurge(db, user);
    if (total === 0) return 'لا بيانات تجريبية في القاعدة — لم يُحذف شيء.';
    revalidatePath('/', 'layout');
    return `حُذف ${total} سجلًا تجريبيًا وكل ما ارتبط بها، وسُجّلت العملية في سجل التدقيق.`;
  });
}
