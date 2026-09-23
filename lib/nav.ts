import { can, type PermissionKey, type SessionUser } from '@/lib/rbac';

// عناصر التنقل تُبنى من الصلاحيات — لا قائمة ثابتة لكل دور (PRD §12 AppShell).
// لا يُضاف عنصر إلا لمسار موجود فعلًا في PRD §11.2 ومنفَّذ في سبرنت مكتمل أو جارٍ.
export type NavIcon = 'users' | 'shield' | 'calendar' | 'layers' | 'tags' | 'map';

export type NavItem = { href: string; label: string; permission: PermissionKey; icon: NavIcon };
export type NavGroup = { label: string; items: NavItem[] };

export const ADMIN_NAV: NavGroup[] = [
  {
    label: 'الإعدادات',
    items: [
      { href: '/admin/settings/users', label: 'المستخدمون والأدوار', permission: 'users:manage_roles', icon: 'users' },
      { href: '/admin/settings/roles', label: 'الأدوار وصلاحياتها', permission: 'users:manage_roles', icon: 'shield' },
      { href: '/admin/settings/terms', label: 'دورات المجلس', permission: 'users:manage_roles', icon: 'calendar' },
      { href: '/admin/settings/committees', label: 'اللجان', permission: 'committees:manage', icon: 'layers' },
      { href: '/admin/settings/categories', label: 'تصنيفات الشكاوى', permission: 'settings:manage', icon: 'tags' },
      { href: '/admin/settings/areas', label: 'المناطق والأحياء', permission: 'settings:manage', icon: 'map' },
    ],
  },
];

export function navFor(user: SessionUser): NavGroup[] {
  return ADMIN_NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(user, i.permission)) })).filter(
    (g) => g.items.length > 0,
  );
}

/** الصفحة التي ينتقل إليها المستخدم بعد الدخول: أول عنصر مسموح له، أو null إن لم تكن له بوابة بعد. */
export function landingPath(user: SessionUser): string | null {
  return navFor(user)[0]?.items[0]?.href ?? null;
}
