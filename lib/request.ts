import 'server-only';
import { isIP } from 'node:net';
import { headers } from 'next/headers';

/** كل عنوان غير صالح أو مفقود يقع في دلو واحد مشترك — أشد، لا دلو جديد لكل قيمة مزيّفة */
export const UNKNOWN_IP = 'unknown';

export type IpConfig = {
  /** رأس تضبطه منصة الاستضافة ولا يستطيع العميل تزويره (مثل x-real-ip على Vercel) — IP_HEADER */
  header?: string;
  /** عدد الوكلاء الموثوقين الذين يضيفون إلى X-Forwarded-For — TRUSTED_PROXY_HOPS (الافتراضي 1) */
  trustedHops: number;
};

export function ipConfig(env: Record<string, string | undefined> = process.env): IpConfig {
  const hops = Number.parseInt(env.TRUSTED_PROXY_HOPS ?? '', 10);
  return {
    header: env.IP_HEADER?.trim().toLowerCase() || undefined,
    trustedHops: Number.isInteger(hops) && hops >= 1 ? hops : 1,
  };
}

/**
 * H-1 (docs/code-and-security-audit.md): عنوان العميل الذي لا يتحكم فيه العميل.
 * أول قيمة في X-Forwarded-For يكتبها العميل نفسه، فتدويرها كان يتجاوز كل حد معدل بالـ IP.
 * القيمة الموثوقة هي التي أضافها أقرب وكيل موثوق: الـ n من اليمين، حيث n = عدد الوكلاء الموثوقين.
 * منطق خالص قابل للاختبار؛ clientIp() يطبّقه على رؤوس الطلب الحالي.
 */
export function resolveClientIp(get: (name: string) => string | null, config: IpConfig): string {
  const valid = (v: string | null | undefined) => {
    const ip = v?.trim();
    return ip && isIP(ip) ? ip : null;
  };
  if (config.header) return valid(get(config.header)) ?? UNKNOWN_IP;

  const chain = (get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (chain.length > 0) {
    // سلسلة أقصر من عدد الوكلاء = الطلب لم يمرّ بها كما يُتوقَّع ⇒ الدلو المشترك
    return chain.length >= config.trustedHops ? (valid(chain[chain.length - config.trustedHops]) ?? UNKNOWN_IP) : UNKNOWN_IP;
  }
  return valid(get('x-real-ip')) ?? UNKNOWN_IP;
}

/** عنوان IP للعميل للطلب الحالي. لا يُمرَّر أبدًا مع شكوى مجهولة (PRD §6.7). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return resolveClientIp((name) => h.get(name), ipConfig());
}

/** يقبل مسارات داخلية فقط، لمنع إعادة التوجيه إلى موقع خارجي بعد الدخول. */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}
