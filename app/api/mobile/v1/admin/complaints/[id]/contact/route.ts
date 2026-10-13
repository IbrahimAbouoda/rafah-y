import { apiRoute, merge } from '@/lib/api/handler';
import { readContact } from '@/lib/complaints/contact';

// بيانات التواصل — فك تشفير بصلاحية complaints:read_contact وسطر تدقيق لكل قراءة (§6.6). لا تُخزَّن على الجهاز.
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => readContact(user, merge(body, { complaintId: params.id })));
