'use server';

import { requireUser } from '@/lib/auth';
import { runActionData, type DataState } from '@/lib/action';
import type { SubmitResult } from '@/lib/complaints/create';
import { submitAccountComplaint, submitPublicComplaint } from '@/lib/complaints/submit';
import { clientIp } from '@/lib/request';

// غلاف Server Action فقط: المنطق في lib/complaints/submit.ts (مشترك مع واجهة الجوّال)

export async function submitComplaintAction(input: unknown): Promise<DataState<SubmitResult>> {
  return runActionData(async () => submitAccountComplaint(await requireUser(), input));
}

export async function submitPublicComplaintAction(input: unknown): Promise<DataState<SubmitResult>> {
  return runActionData(async () => submitPublicComplaint(input, await clientIp()));
}
