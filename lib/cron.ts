import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { logError } from '@/lib/log';

// مسارات الجدولة (S5-1) — بلا مستخدم: السرّ يحلّ محلّ الصلاحية، وبلا CRON_SECRET يُرفض كل استدعاء (فشل مغلق).

const digest = (v: string) => createHash('sha256').update(v).digest();

/** مقارنة بزمن ثابت — الطولان متساويان دائمًا بعد التجزئة */
function authorized(request: Request, secret: string): boolean {
  return timingSafeEqual(digest(request.headers.get('authorization') ?? ''), digest(`Bearer ${secret}`));
}

export function cronHandler(name: string, job: () => Promise<Record<string, number>>) {
  return async function handle(request: Request): Promise<Response> {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 16) {
      return Response.json({ error: 'CRON_SECRET غير مضبوط على الخادم (16 محرفًا على الأقل).' }, { status: 503 });
    }
    if (!authorized(request, secret)) return Response.json({ error: 'غير مصرّح.' }, { status: 401 });
    try {
      return Response.json({ ok: true, ...(await job()) });
    } catch (e) {
      logError(`cron.${name}`, e);
      return Response.json({ error: 'تعذّر تنفيذ المهمة المجدولة. راجع سجل الخادم.' }, { status: 500 });
    }
  };
}
