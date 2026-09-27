import { describe, expect, it } from 'vitest';
import { isInternal, landingPath, meNavFor, navFor, partnerNavFor } from '@/lib/nav';
import { buildGrants, canBeyondOwn, scopeFilter, type AssignmentRow, type SessionUser } from '@/lib/rbac';
import { PERMISSIONS, type RoleKey } from '@/prisma/rbac.seed';

// التنقل يُبنى من المصفوفة المزروعة نفسها (§3.3)، لا من أسماء الأدوار

const COMMITTEE = '00000000-0000-4000-8000-00000000000c';

function asUser(roles: { key: RoleKey; committeeId?: string }[]): SessionUser {
  const rows: AssignmentRow[] = roles.map((r) => ({
    committeeId: r.committeeId ?? null,
    committee: r.committeeId ? { slug: 'c', nameAr: 'لجنة' } : null,
    endsAt: null,
    role: {
      key: r.key,
      nameAr: r.key,
      permissions: PERMISSIONS.flatMap((p) => {
        const scope = (p.grants as Partial<Record<RoleKey, 'OWN' | 'COMMITTEE' | 'ALL'>>)[r.key];
        return scope ? [{ scope, permission: { key: p.key } }] : [];
      }),
    },
  }));
  return {
    id: 'u',
    authId: 'u',
    fullName: 'اختبار',
    email: null,
    phone: null,
    roles: [],
    grants: buildGrants(rows),
  };
}

const hrefs = (groups: { items: { href: string }[] }[]) => groups.flatMap((g) => g.items.map((i) => i.href));

describe('بوابة الشباب ولوحة المجلس — من الصلاحيات', () => {
  it('الشاب: /me فقط، ولا يرى /admin/complaints رغم complaints:read بنطاق «خاص»', () => {
    const youth = asUser([{ key: 'youth' }]);
    expect(isInternal(youth)).toBe(false);
    expect(landingPath(youth)).toBe('/me');
    expect(hrefs(meNavFor(youth))).toEqual([
      '/me',
      '/me/complaints',
      '/me/complaints/new',
      '/me/ideas',
      '/me/applications',
      '/me/profile',
      '/me/notifications',
    ]);
    expect(canBeyondOwn(youth, 'complaints:read')).toBe(false);
  });

  it('أمين السر: الوارد والشكاوى والأفكار واللجان، بلا سجل التدقيق', () => {
    const secretary = asUser([{ key: 'secretary' }]);
    expect(landingPath(secretary)).toBe('/admin');
    const admin = hrefs(navFor(secretary));
    expect(admin).toEqual([
      '/admin',
      '/admin/inbox',
      '/admin/complaints',
      '/admin/ideas',
      '/admin/committees',
      '/admin/tasks',
      '/admin/initiatives',
      '/admin/organizations',
      '/admin/opportunities',
      '/admin/activities',
    ]);
  });

  it('رئيس اللجنة: شكاوى لجنته وأفكارها ومهامها، بلا وارد ولا تدقيق', () => {
    const head = asUser([{ key: 'committee_head', committeeId: COMMITTEE }]);
    expect(hrefs(navFor(head))).toEqual([
      '/admin',
      '/admin/complaints',
      '/admin/ideas',
      '/admin/committees',
      '/admin/tasks',
      '/admin/initiatives',
      '/admin/organizations',
      '/admin/activities',
    ]);
    expect(scopeFilter(head, 'complaints:read')).toEqual({ all: false, committees: [COMMITTEE], own: false });
  });

  it('مراقب البلدية: الشكاوى قراءةً بنطاق الكل، بلا تدقيق (§3.4)', () => {
    const observer = asUser([{ key: 'municipality_observer' }]);
    expect(hrefs(navFor(observer))).toEqual(['/admin', '/admin/complaints', '/admin/committees', '/admin/tasks', '/admin/organizations', '/admin/finance']);
    expect(scopeFilter(observer, 'complaints:read')).toEqual({ all: true });
    expect(canBeyondOwn(observer, 'complaints:read_contact')).toBe(false);
  });

  it('الرئيس: الوارد والشكاوى والتدقيق والإعدادات', () => {
    const president = asUser([{ key: 'council_president' }, { key: 'youth' }]);
    const admin = hrefs(navFor(president));
    expect(admin.slice(0, 12)).toEqual([
      '/admin',
      '/admin/inbox',
      '/admin/complaints',
      '/admin/ideas',
      '/admin/committees',
      '/admin/tasks',
      '/admin/initiatives',
      '/admin/organizations',
      '/admin/finance',
      '/admin/opportunities',
      '/admin/activities',
      '/admin/audit',
    ]);
    expect(admin).toContain('/admin/settings/users');
  });

  it('المدير التقني: التدقيق والإعدادات، بلا شكاوى (§3.4 «لا يدير المحتوى»)', () => {
    const tech = asUser([{ key: 'super_admin' }]);
    const admin = hrefs(navFor(tech));
    expect(admin).toContain('/admin/audit');
    expect(admin).not.toContain('/admin/complaints');
    expect(admin).not.toContain('/admin/inbox');
  });

  it('المؤسسة الشريكة: بوابة /partner فقط، بلا لوحة المجلس (D26)', () => {
    const partner = asUser([{ key: 'partner' }, { key: 'youth' }]);
    expect(isInternal(partner)).toBe(false);
    expect(landingPath(partner)).toBe('/partner');
    expect(hrefs(partnerNavFor(partner))).toEqual(['/partner', '/partner/needs', '/partner/offers', '/partner/opportunities']);
  });

  it('عضو اللجنة: لا «الأنشطة» (لا activities:update) — يصل للحضور من لوحة لجنته (AC-13)', () => {
    const member = asUser([{ key: 'committee_member', committeeId: COMMITTEE }]);
    expect(hrefs(navFor(member))).not.toContain('/admin/activities');
    expect(scopeFilter(member, 'activities:attendance')).toEqual({ all: false, committees: [COMMITTEE], own: false });
  });

  it('أمين الصندوق: السجل المالي، بلا شكاوى', () => {
    const treasurer = asUser([{ key: 'treasurer' }]);
    const admin = hrefs(navFor(treasurer));
    expect(admin).toContain('/admin/finance');
    expect(admin).not.toContain('/admin/complaints');
  });
});
