'use server';

import { requireUser } from '@/lib/auth';
import { formToObject, runActionData, type DataState } from '@/lib/action';
import { readContact, type ComplaintContactView } from '@/lib/complaints/contact';

// غلاف Server Action فقط: الهوية من الكوكي، والمنطق كله في lib/complaints/contact.ts (مشترك مع واجهة الجوّال)

export async function readContactAction(_prev: unknown, form: FormData): Promise<DataState<ComplaintContactView>> {
  return runActionData(async () => readContact(await requireUser(), formToObject(form)));
}
