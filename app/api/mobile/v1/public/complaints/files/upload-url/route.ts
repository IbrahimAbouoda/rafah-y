import { apiRoute } from '@/lib/api/handler';
import { createUploadUrl } from '@/lib/complaints/attachments';
import { clientIp } from '@/lib/request';

// رابط رفع موقّع لمرفق شكوى — إثبات الملكية بالرقم والرمز (§6.5)
export const POST = apiRoute({ auth: 'none' }, async ({ body }) => createUploadUrl(body, await clientIp()));
