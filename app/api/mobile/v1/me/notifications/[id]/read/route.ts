import { apiRoute, merge } from '@/lib/api/handler';
import { markRead } from '@/lib/notifications/actions';

// تعليم إشعار كمقروء — إشعاراتك فقط
export const POST = apiRoute<{ id: string }>({ auth: 'required' }, async ({ user, params, body }) => ({
  message: (await markRead(user, merge(body, { notificationId: params.id }))) ?? undefined,
}));
