import { createHash, timingSafeEqual } from 'node:crypto';
import { logError } from '@/lib/log';
import { sendDueSoonReminders } from '@/lib/tasks/reminders';

// S5-1 — تذكير «اقتراب موعد مهمة» المجدول. تستدعيه جدولة المنصة المضيفة (كل ساعة مثلًا)، ويُستدعى يدويًا في التطوير:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/task-reminders
// ليس صفحة ولا يُرى في التنقل. بلا مستخدم: السرّ يحلّ محلّ الصلاحية، وبلا CRON_SECRET يُرفض كل استدعاء (فشل مغلق).

export const dynamic = 'force-dynamic';

const digest = (v: string) => createHash('sha256').update(v).digest();

/** مقارنة بزمن ثابت — الطولان متساويان دائمًا بعد التجزئة */
function authorized(request: Request, secret: string): boolean {
  const header = request.headers.get('authorization') ?? '';
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) {
    return Response.json({ error: 'CRON_SECRET غير مضبوط على الخادم (16 محرفًا على الأقل).' }, { status: 503 });
  }
  if (!authorized(request, secret)) return Response.json({ error: 'غير مصرّح.' }, { status: 401 });
  try {
    const result = await sendDueSoonReminders();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    logError('cron.task-reminders', e);
    return Response.json({ error: 'تعذّر إرسال التذكيرات. راجع سجل الخادم.' }, { status: 500 });
  }
}

// GET لجدولات تستدعي بـ GET فقط (مثل Vercel Cron) · POST للاستدعاء اليدوي
export const GET = handle;
export const POST = handle;
