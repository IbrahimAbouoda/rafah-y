'use client';

import { createContext, use } from 'react';
import type { PermissionKey, SerializedGrants } from '@/lib/rbac';

const GrantsContext = createContext<{ userId: string; grants: SerializedGrants } | null>(null);

export function PermissionsProvider({
  userId,
  grants,
  children,
}: {
  userId: string;
  grants: SerializedGrants;
  children: React.ReactNode;
}) {
  return <GrantsContext value={{ userId, grants }}>{children}</GrantsContext>;
}

/**
 * هذا المكوّن تجميل. الخادم يفحص الصلاحية مرة أخرى دائمًا.
 * (PRD §12 — إخفاء الزر ليس حماية؛ can() على الخادم في كل Server Action.)
 */
export function PermissionGate({
  permission,
  committeeId,
  ownerId,
  fallback = null,
  children,
}: {
  permission: PermissionKey;
  committeeId?: string | null;
  ownerId?: string | null;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ctx = use(GrantsContext);
  const g = ctx?.grants[permission];
  let allowed = false;
  if (g) {
    if (committeeId === undefined && ownerId === undefined) allowed = true;
    else if (g.all) allowed = true;
    else if (committeeId && g.committees.includes(committeeId)) allowed = true;
    else if (g.own && ownerId && ownerId === ctx?.userId) allowed = true;
  }
  return <>{allowed ? children : fallback}</>;
}
