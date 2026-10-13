import { apiRoute } from '@/lib/api/handler';
import { confirmUpload } from '@/lib/complaints/attachments';

// تأكيد الرفع: الحجم والنوع الحقيقي والبصمة، ثم الفحص الأمني
export const POST = apiRoute({ auth: 'none' }, async ({ body }) => confirmUpload(body));
