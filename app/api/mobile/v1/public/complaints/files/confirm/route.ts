import { apiRoute } from '@/lib/api/handler';
import { confirmUpload } from '@/lib/complaints/attachments';
import { clientIp } from '@/lib/request';

// تأكيد الرفع: الحجم والنوع الحقيقي والبصمة، ثم الفحص الأمني
export const POST = apiRoute({ auth: 'none' }, async ({ body }) => confirmUpload(body, await clientIp()));
