import 'server-only';
import { LRUCache } from 'lru-cache';

// حد المعدل — PRD §6.4: Upstash Redis في الإنتاج (REST، بلا حزمة إضافية)، وذاكرة LRU داخل العملية في التطوير.

interface Store {
  /** يزيد العدّاد ويضبط انتهاءه عند أول زيادة فقط (نافذة ثابتة) */
  hit(key: string, windowSec: number): Promise<{ count: number; ttlSec: number }>;
  /** الثواني المتبقية لمفتاح موجود، أو 0 */
  ttl(key: string): Promise<number>;
  set(key: string, ttlSec: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
}

class MemoryStore implements Store {
  private cache = new LRUCache<string, { count: number; expiresAt: number }>({ max: 50_000 });
  private live(key: string) {
    const e = this.cache.get(key);
    if (e && e.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return e;
  }
  async hit(key: string, windowSec: number) {
    const e = this.live(key);
    if (!e) {
      this.cache.set(key, { count: 1, expiresAt: Date.now() + windowSec * 1000 });
      return { count: 1, ttlSec: windowSec };
    }
    e.count += 1;
    return { count: e.count, ttlSec: Math.ceil((e.expiresAt - Date.now()) / 1000) };
  }
  async ttl(key: string) {
    const e = this.live(key);
    return e ? Math.ceil((e.expiresAt - Date.now()) / 1000) : 0;
  }
  async set(key: string, ttlSec: number) {
    this.cache.set(key, { count: 1, expiresAt: Date.now() + ttlSec * 1000 });
  }
  async del(...keys: string[]) {
    for (const k of keys) this.cache.delete(k);
  }
}

class UpstashStore implements Store {
  constructor(
    private url: string,
    private token: string,
  ) {}
  private async pipeline(commands: (string | number)[][]) {
    const res = await fetch(`${this.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}` },
      body: JSON.stringify(commands),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Upstash ${res.status}`);
    return (await res.json()) as { result: number }[];
  }
  async hit(key: string, windowSec: number) {
    const [incr, , ttl] = await this.pipeline([
      ['INCR', key],
      ['EXPIRE', key, windowSec, 'NX'],
      ['TTL', key],
    ]);
    return { count: incr?.result ?? 1, ttlSec: Math.max(1, ttl?.result ?? windowSec) };
  }
  async ttl(key: string) {
    const [ttl] = await this.pipeline([['TTL', key]]);
    return Math.max(0, ttl?.result ?? 0);
  }
  async set(key: string, ttlSec: number) {
    await this.pipeline([['SET', key, 1, 'EX', ttlSec]]);
  }
  async del(...keys: string[]) {
    await this.pipeline([['DEL', ...keys]]);
  }
}

const globalForLimit = globalThis as unknown as { rateLimitStore?: Store };

export type StoreChoice = { kind: 'upstash'; url: string; token: string } | { kind: 'memory' };

/**
 * H-2 (docs/code-and-security-audit.md) · D11: في الإنتاج Upstash إلزامي. ذاكرة العملية تعدّ لكل نسخة على حدة
 * وتُصفَّر مع كل تشغيل بارد، فتصير الحدود بلا أثر على الاستضافة بلا خادم — لذا لا رجوع صامت إليها.
 * RATE_LIMIT_STORE=memory يسمح بها صراحةً لتجربة بناء الإنتاج محليًا فقط.
 */
export function chooseStore(env: Record<string, string | undefined>): StoreChoice {
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = env;
  if (url && token) return { kind: 'upstash', url, token };
  if (env.NODE_ENV !== 'production' || env.RATE_LIMIT_STORE === 'memory') return { kind: 'memory' };
  throw new Error(
    'Rate limiting requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in production (D11). ' +
      'Set RATE_LIMIT_STORE=memory only for a local production build.',
  );
}

function store(): Store {
  if (!globalForLimit.rateLimitStore) {
    // يُلقى الخطأ هنا عند أول استخدام، فيُرفض الإجراء (فشل مغلق) ويُسجَّل السبب
    const choice = chooseStore(process.env);
    globalForLimit.rateLimitStore = choice.kind === 'upstash' ? new UpstashStore(choice.url, choice.token) : new MemoryStore();
  }
  return globalForLimit.rateLimitStore;
}

export const LIMITS = {
  register: { max: 5, windowSec: 3600 },
  resetPassword: { max: 5, windowSec: 3600 },
  loginFailures: { max: 5, windowSec: 3600 },
  /** شكوى من حساب — لكل حساب (§6.4) */
  complaint: { max: 3, windowSec: 3600 },
  /** شكوى زائر — لكل IP، أشد من الحساب (§6.4 · D21) */
  publicComplaint: { max: 2, windowSec: 3600 },
  /** /track — لكل IP، إلزامي وإلا صار الرمز قابلًا للتخمين (§6.4 · AC-02 ④) */
  track: { max: 10, windowSec: 3600 },
  /** رفع ملف — لكل IP (§6.4) */
  upload: { max: 10, windowSec: 3600 },
  /** سؤال البوت وإرسال الاستفسار — لكل حساب أو IP (§6.4) */
  bot: { max: 20, windowSec: 3600 },
} as const;

export type LimitResult = { allowed: boolean; retryAfterSec: number };

type Bucket = 'register' | 'resetPassword' | 'complaint' | 'publicComplaint' | 'track' | 'upload' | 'bot';

export async function limit(bucket: Bucket, id: string): Promise<LimitResult> {
  const { max, windowSec } = LIMITS[bucket];
  const { count, ttlSec } = await store().hit(`rl:${bucket}:${id}`, windowSec);
  return { allowed: count <= max, retryAfterSec: ttlSec };
}

/** تسجيل الدخول (§6.4): بعد 5 إخفاقات، حظر مؤقت يتضاعف مع كل إخفاق — 1، 2، 4، 8… دقائق بحد أقصى 60. */
export function loginBackoffSec(failures: number): number {
  if (failures < LIMITS.loginFailures.max) return 0;
  return Math.min(60, 2 ** (failures - LIMITS.loginFailures.max)) * 60;
}

export async function loginBlockedFor(id: string): Promise<number> {
  return store().ttl(`rl:loginBlock:${id}`);
}

export async function recordLoginFailure(id: string): Promise<void> {
  const { count } = await store().hit(`rl:loginFailures:${id}`, LIMITS.loginFailures.windowSec);
  const backoff = loginBackoffSec(count);
  if (backoff > 0) await store().set(`rl:loginBlock:${id}`, backoff);
}

export async function clearLoginFailures(id: string): Promise<void> {
  await store().del(`rl:loginFailures:${id}`, `rl:loginBlock:${id}`);
}

// ─── نافذة الاستعادة — M-4 ─────────────────────────────────────────────
// تغيير كلمة المرور بلا الكلمة الحالية مسموح فقط بعد فتح رابط الاستعادة من البريد.
// الجلسة وحدها لا تميّزه (amr = otp كأي رمز لمرة واحدة)، فتُسجَّل النافذة على الخادم عند نجاح تبادل الرابط.

export const RECOVERY_WINDOW_SEC = 15 * 60;

export async function markRecovery(userId: string): Promise<void> {
  await store().set(`rl:recovery:${userId}`, RECOVERY_WINDOW_SEC);
}

export async function recoveryActive(userId: string): Promise<boolean> {
  return (await store().ttl(`rl:recovery:${userId}`)) > 0;
}

/** تُستهلك النافذة مع أول تغيير ناجح: الرابط الواحد يغيّر كلمة المرور مرة واحدة */
export async function consumeRecovery(userId: string): Promise<void> {
  await store().del(`rl:recovery:${userId}`);
}
