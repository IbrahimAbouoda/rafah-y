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
