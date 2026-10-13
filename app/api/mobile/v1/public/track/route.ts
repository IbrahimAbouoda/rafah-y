import { apiRoute } from '@/lib/api/handler';
import { trackComplaint } from '@/lib/complaints/tracking';
import { clientIp } from '@/lib/request';

// تتبّع شكوى بالرقم والرمز — AC-02 (حد معدل على IP إلزامي)
export const POST = apiRoute({ auth: 'none' }, async ({ body }) => trackComplaint(body, await clientIp()));
