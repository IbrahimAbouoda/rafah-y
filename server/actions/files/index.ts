'use server';

import { requireUser } from '@/lib/auth';
import { formToObject, runActionData, type DataState } from '@/lib/action';
import { confirmUpload, createUploadUrl, getDownloadUrl, type UploadTicket } from '@/lib/complaints/attachments';
import { clientIp } from '@/lib/request';

// غلاف Server Action فقط: المنطق في lib/complaints/attachments.ts (مشترك مع واجهة الجوّال)

export async function createUploadUrlAction(input: unknown): Promise<DataState<UploadTicket>> {
  return runActionData(async () => createUploadUrl(input, await clientIp()));
}

export async function confirmUploadAction(input: unknown): Promise<DataState<{ fileId: string }>> {
  return runActionData(async () => confirmUpload(input, await clientIp()));
}

export async function getDownloadUrlAction(_prev: unknown, form: FormData): Promise<DataState<{ url: string }>> {
  return runActionData(async () => getDownloadUrl(await requireUser(), formToObject(form)));
}
