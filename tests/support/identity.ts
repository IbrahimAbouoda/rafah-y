import type { SessionUser } from '@/lib/rbac';

let current: SessionUser | null = null;

export const currentTestUser = () => current;
export const setTestUser = (user: SessionUser | null) => {
  current = user;
};

// عنوان IP للطلب الحالي — حدود المعدل على IP (§6.4) تحتاج عنوانًا مختلفًا لكل اختبار
let ip = '203.0.113.1';
export const currentTestIp = () => ip;
export const setTestIp = (value: string) => {
  ip = value;
};

// ─── after() في الاختبار ─────────────────────────────────────────────
const pendingAfter: Promise<unknown>[] = [];

export function scheduleAfter(task: (() => unknown) | Promise<unknown>): void {
  pendingAfter.push(Promise.resolve().then(() => (typeof task === 'function' ? task() : task)));
}

/** ينتظر كل ما جُدول بـ after() حتى الآن */
export async function flushAfter(): Promise<void> {
  while (pendingAfter.length) await Promise.allSettled(pendingAfter.splice(0));
}
