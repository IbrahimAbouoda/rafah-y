'use server';

import { formToObject, runActionData, type DataState } from '@/lib/action';
import { trackComplaint, type TrackedComplaint } from '@/lib/complaints/tracking';
import { clientIp } from '@/lib/request';

// غلاف Server Action فقط: المنطق في lib/complaints/tracking.ts (مشترك مع واجهة الجوّال)

export async function trackComplaintAction(_prev: unknown, form: FormData): Promise<DataState<TrackedComplaint>> {
  return runActionData(async () => trackComplaint(formToObject(form), await clientIp()));
}
