'use server';

import { requirePermission, requireUser } from '@/lib/auth';
import { runActionData, type DataState } from '@/lib/action';
import { submitComplaint, type SubmitResult } from '@/lib/complaints/create';
import { clientIp } from '@/lib/request';
import { SubmitComplaintSchema } from '@/lib/validation/complaints';

// AC-01 · AC-17 — تقديم شكوى. المدخل كائن عادي لأن المسودة قد تُرسل من IndexedDB بعد عودة الاتصال.

const received = (r: SubmitResult) =>
  r.duplicate
    ? 'وصلت شكواك من قبل. هذا رقمها، ومعه رمز متابعة جديد يحلّ محلّ أي رمز سابق.'
    : 'وصلت شكواك. احفظ الرقم والرمز الآن: الرمز لن يظهر مرة أخرى.';

/** شاب مسجّل — /me/complaints/new */
export async function submitComplaintAction(input: unknown): Promise<DataState<SubmitResult>> {
  return runActionData(async () => {
    const user = await requireUser();
    requirePermission(user, 'complaints:create');
    const data = SubmitComplaintSchema.parse(input);
    // complaints:create بنطاق «خاص»: السجل يُنشأ لصاحبه نفسه
    requirePermission(user, 'complaints:create', { ownerId: user.id });
    const result = await submitComplaint(data, { kind: 'account', user });
    return { message: received(result), data: result };
  });
}

/**
 * زائر بلا حساب — /complaints/public-new. الاستثناء الوحيد من فحص الهوية (PRD §6.2):
 * يحلّ محلّه حد معدل مشدّد (D21)، و submitterId = NULL دائمًا، ولا يُحفظ الـ IP مع الشكوى.
 */
export async function submitPublicComplaintAction(input: unknown): Promise<DataState<SubmitResult>> {
  return runActionData(async () => {
    const data = SubmitComplaintSchema.parse(input);
    const result = await submitComplaint(data, { kind: 'public', ip: await clientIp() });
    return { message: received(result), data: result };
  });
}
