import type { SessionUser } from '@/lib/rbac';

let current: SessionUser | null = null;

export const currentTestUser = () => current;
export const setTestUser = (user: SessionUser | null) => {
  current = user;
};
