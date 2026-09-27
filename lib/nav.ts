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
  | 'history'
  | 'lightbulb'
  | 'kanban'
  | 'committee'
  | 'rocket'
  | 'building'
  | 'wallet'
  | 'handshake'
  | 'briefcase'
  | 'sparkles'
  | 'user';

/**
 * permission = null ⇒ يكفي تسجيل الدخول.
 * beyondOwn ⇒ يُعرض فقط لمن تمتد صلاحيته إلى سجلات غيره (لجنة أو الكل)، لا لمن يملكها على سجلاته فقط.
 */
/** permission مصفوفة ⇒ تكفي أيٌّ منها (مثل /admin/initiatives وتبويباته) */
export type NavItem = {
  href: string;
  label: string;
  permission: PermissionKey | PermissionKey[] | null;
  beyondOwn?: boolean;
  icon: NavIcon;
};
export type NavGroup = { label: string; items: NavItem[] };

export const ADMIN_NAV: NavGroup[] = [
  {
    label: 'العمل',
    items: [
      // /admin/inbox: complaints:triage أو ideas:review أو offers:decide (D4). قسما الأفكار والعروض في Sprint 2 و 3،
      // فالعنصر يظهر الآن لمن يملك الفرز وحده حتى لا يفتح أحد صندوقًا بلا قسم له.
      { href: '/admin/inbox', label: 'صندوق الوارد', permission: 'complaints:triage', icon: 'inbox' },
      { href: '/admin/complaints', label: 'الشكاوى', permission: 'complaints:read', beyondOwn: true, icon: 'file' },
      { href: '/admin/ideas', label: 'الأفكار', permission: 'ideas:review', icon: 'lightbulb' },
      { href: '/admin/committees', label: 'اللجان', permission: 'committees:read', beyondOwn: true, icon: 'committee' },
      { href: '/admin/tasks', label: 'مهامي', permission: 'tasks:read', icon: 'kanban' },
      {
        href: '/admin/initiatives',
        label: 'المبادرات',
        // تبويبات الصفحة: المبادرات · استطلاعات الطلب · مسودات Concept Note (D30)
        permission: ['initiatives:update', 'demand:manage', 'concept_notes:approve'],
        icon: 'rocket',
      },
      { href: '/admin/organizations', label: 'المؤسسات', permission: 'organizations:read', beyondOwn: true, icon: 'building' },
      { href: '/admin/finance', label: 'السجل المالي', permission: 'finance:read', icon: 'wallet' },
      { href: '/admin/opportunities', label: 'الفرص', permission: 'opportunities:publish', icon: 'briefcase' },
      // activities:update بنطاق لجنة أو الكل؛ عضو اللجنة (حضور فقط) يصل لصفحة الحضور من لوحة لجنته
      { href: '/admin/activities', label: 'الأنشطة', permission: 'activities:update', icon: 'sparkles' },
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
      { href: '/me/ideas', label: 'أفكاري', permission: 'ideas:create', icon: 'lightbulb' },
      { href: '/me/applications', label: 'طلباتي على الفرص', permission: 'opportunities:apply', icon: 'briefcase' },
      { href: '/me/profile', label: 'ملفي ومهاراتي', permission: 'profiles:update', icon: 'user' },
      { href: '/me/notifications', label: 'الإشعارات', permission: null, icon: 'bell' },
    ],
  },
];

// بوابة المؤسسات — D26: من رُبط بمؤسسة ومُنح دور partner
export const PARTNER_NAV: NavGroup[] = [
  {
    label: 'بوابة المؤسسات',
    items: [
      { href: '/partner', label: 'لوحة المؤسسة', permission: 'offers:create', icon: 'home' },
      { href: '/partner/needs', label: 'الاحتياجات المفتوحة', permission: 'offers:create', icon: 'handshake' },
      { href: '/partner/offers', label: 'عروض دعمنا', permission: 'offers:read', icon: 'file' },
      { href: '/partner/opportunities', label: 'فرصنا', permission: 'opportunities:create', icon: 'briefcase' },
    ],
  },
];

function allowed(user: SessionUser, item: NavItem): boolean {
  if (!item.permission) return true;
  const keys = Array.isArray(item.permission) ? item.permission : [item.permission];
  return keys.some((k) => (item.beyondOwn ? canBeyondOwn(user, k) : can(user, k)));
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

export function partnerNavFor(user: SessionUser): NavGroup[] {
  return filterNav(PARTNER_NAV, user);
}

export const isPartner = (user: SessionUser) => can(user, 'offers:create');

export function meNavFor(user: SessionUser): NavGroup[] {
  return filterNav(ME_NAV, user);
}

/** بعد الدخول: لوحة المجلس لمن له دور داخلي، ثم بوابة المؤسسات لممثليها، وبوابة الشباب لغيرهم. */
export function landingPath(user: SessionUser): string {
  if (isInternal(user)) return '/admin';
  return isPartner(user) ? '/partner' : '/me';
}
