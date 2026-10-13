import { apiRoute } from '@/lib/api/handler';
import { submitPublicComplaint } from '@/lib/complaints/submit';
import { clientIp } from '@/lib/request';

// شكوى زائر — /complaints/public-new: بلا حساب، حد معدل مشدّد (D21)، submitterId = NULL
export const POST = apiRoute({ auth: 'none' }, async ({ body }) => ({ ...(await submitPublicComplaint(body, await clientIp())), status: 201 }));
