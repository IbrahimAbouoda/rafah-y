import { can, canBeyondOwn, type PermissionKey, type SessionUser } from '@/lib/rbac';

// عناصر التنقل تُبنى من الصلاحيات — لا قائمة ثابتة لكل دور (PRD §12 AppShell).
// لا يُضاف عنصر إلا لمسار موجود فعلًا في PRD §11.2 ومنفَّذ في سبرنت مكتمل أو جارٍ.
export type NavIcon =
  | 'users'
  | 'shield'
  | 'calendar'
  | 'layers'
  | 'tags'
  | 'map'
  | 'home'
  | 'inbox'
  | 'file'
  | 'plus'
  | 'bell'
  | 'history';

/**
 * permission = null ⇒ يكفي تسجيل الدخول.
 * beyondOwn ⇒ يُعرض فقط لمن تمتد صلاحيته إلى سجلات غيره (لجنة أو الكل)، لا لمن يملكها على سجلاته فقط.
 */
export type NavItem = { href: string; label: string; permission: PermissionKey | null; beyondOwn?: boolean; icon: NavIcon };
export type NavGroup = { label: string; items: NavItem[] };

export const ADMIN_NAV: NavGroup[] = [
  {
    label: 'العمل',
    items: [
      // /admin/inbox: complaints:triage أو ideas:review أو offers:decide (D4). قسما الأفكار والعروض في Sprint 2 و 3،
      // فالعنصر يظهر الآن لمن يملك الفرز وحده حتى لا يفتح أحد صندوقًا بلا قسم له.
      { href: '/admin/inbox', label: 'صندوق الوارد', permission: 'complaints:triage', icon: 'inbox' },
      { href: '/admin/complaints', label: 'الشكاوى', permission: 'complaints:read', beyondOwn: true, icon: 'file' },
      { href: '/admin/audit', label: 'سجل التدقيق', permission: 'audit:read', beyondOwn: true, icon: 'history' },
    ],
  },
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

export const ME_NAV: NavGroup[] = [
  {
    label: 'بوابة الشباب',
    items: [
      { href: '/me', label: 'لوحتي', permission: null, icon: 'home' },
      { href: '/me/complaints', label: 'شكاواي', permission: 'complaints:read', icon: 'file' },
      { href: '/me/complaints/new', label: 'تقديم شكوى', permission: 'complaints:create', icon: 'plus' },
      { href: '/me/notifications', label: 'الإشعارات', permission: null, icon: 'bell' },
    ],
  },
];

function allowed(user: SessionUser, item: NavItem): boolean {
  if (!item.permission) return true;
  return item.beyondOwn ? canBeyondOwn(user, item.permission) : can(user, item.permission);
}

function filterNav(groups: NavGroup[], user: SessionUser): NavGroup[] {
  return groups.map((g) => ({ ...g, items: g.items.filter((i) => allowed(user, i)) })).filter((g) => g.items.length > 0);
}

/** لوحة المجلس: /admin (اللوحة) + ما يسمح به دوره. فارغة ⇒ ليس دورًا داخليًا. */
export function navFor(user: SessionUser): NavGroup[] {
  const groups = filterNav(ADMIN_NAV, user);
  if (groups.length === 0) return [];
  const [first, ...rest] = groups;
  const home: NavItem = { href: '/admin', label: 'اللوحة', permission: null, icon: 'home' };
  return [{ ...first!, items: [home, ...first!.items] }, ...rest];
}

export const isInternal = (user: SessionUser) => navFor(user).length > 0;

export function meNavFor(user: SessionUser): NavGroup[] {
  return filterNav(ME_NAV, user);
}

/** بعد الدخول: لوحة المجلس لمن له دور داخلي، وبوابة الشباب لغيره. */
export function landingPath(user: SessionUser): string {
  return isInternal(user) ? '/admin' : '/me';
}
