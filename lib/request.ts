import 'server-only';
import { headers } from 'next/headers';

/** عنوان IP للعميل من رؤوس الوكيل. لا يُمرَّر أبدًا مع شكوى مجهولة (PRD §6.7). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}

/** يقبل مسارات داخلية فقط، لمنع إعادة التوجيه إلى موقع خارجي بعد الدخول. */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}
