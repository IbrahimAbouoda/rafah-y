import { apiRoute } from '@/lib/api/handler';
import { markAllRead } from '@/lib/notifications/actions';

// تعليم كل الإشعارات كمقروءة
export const POST = apiRoute({ auth: 'required' }, async ({ user }) => ({ message: await markAllRead(user) }));
