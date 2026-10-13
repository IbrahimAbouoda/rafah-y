import { apiRoute, merge } from '@/lib/api/handler';
import { getDownloadUrl } from '@/lib/complaints/attachments';

// رابط تنزيل موقّع قصير العمر لمرفق نظيف، بعد فحص complaints:read بنطاق الشكوى وسطر تدقيق
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => getDownloadUrl(user, merge(body, { fileId: params.id })));
