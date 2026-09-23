import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES, type RoleKey } from '@/prisma/rbac.seed';

// المصفوفة كما في PRD §3.3 وقواعد §3.4 الثابتة

const grants = (key: string) => (PERMISSIONS.find((p) => p.key === key)?.grants ?? {}) as Partial<Record<RoleKey, string>>;
const holders = (key: string) => Object.keys(grants(key)).sort();

describe('مصفوفة الصلاحيات', () => {
  it('10 أدوار × 69 صلاحية = 202 منحة', () => {
    expect(ROLES).toHaveLength(10);
    expect(PERMISSIONS).toHaveLength(69);
    expect(new Set(PERMISSIONS.map((p) => p.key)).size).toBe(69);
    expect(PERMISSIONS.reduce((n, p) => n + Object.keys(p.grants).length, 0)).toBe(202);
  });

  it('عدد صلاحيات كل دور يطابق PRD §2', () => {
    const expected: Record<RoleKey, number> = {
      super_admin: 6,
      council_president: 49,
      vice_president: 34,
      secretary: 32,
      treasurer: 11,
      committee_head: 31,
      committee_member: 12,
      municipality_observer: 10,
      partner: 7,
      youth: 10,
    };
    for (const role of ROLES) {
      expect(PERMISSIONS.filter((p) => role.key in p.grants).length, role.key).toBe(expected[role.key]);
    }
  });

  it('المدير التقني لا يدير المحتوى ولا يرى بيانات التواصل', () => {
    const own = PERMISSIONS.filter((p) => 'super_admin' in p.grants).map((p) => p.key).sort();
    expect(own).toEqual(
      ['audit:read', 'committees:manage', 'committees:read', 'reports:read', 'settings:manage', 'users:manage_roles'].sort(),
    );
  });

  it('فصل المهام المالية: التسجيل لأمين الصندوق وحده، والاعتماد للرئيس وحده', () => {
    expect(holders('finance:record')).toEqual(['treasurer']);
    expect(holders('finance:approve')).toEqual(['council_president']);
  });

  it('اعتماد المهام: الرئيس والنائب (الكل) ورئيس اللجنة (لجنته) — لا العضو (قرار D3)', () => {
    expect(grants('tasks:approve')).toEqual({ council_president: 'ALL', vice_president: 'ALL', committee_head: 'COMMITTEE' });
  });

  it('البلدية بلا بيانات شخصية ولا سجل تدقيق، وكل صلاحياتها قراءة بنطاق الكل', () => {
    expect(grants('complaints:read_contact')).not.toHaveProperty('municipality_observer');
    expect(grants('audit:read')).not.toHaveProperty('municipality_observer');
    const observer = PERMISSIONS.filter((p) => 'municipality_observer' in p.grants);
    for (const p of observer) {
      expect(p.key).toMatch(/:(read|read_internal|export)$/);
      expect((p.grants as Record<string, string>).municipality_observer).toBe('ALL');
    }
  });

  it('الاعتمادات النهائية للرئيس وحده (Q2)', () => {
    for (const key of ['ideas:approve', 'initiatives:approve', 'offers:decide', 'concept_notes:approve', 'reports:publish']) {
      expect(holders(key), key).toEqual(['council_president']);
    }
  });

  it('صلاحيات الشاب كلها بنطاق خاص', () => {
    for (const p of PERMISSIONS) {
      const scope = (p.grants as Record<string, string>).youth;
      if (scope) expect(scope, p.key).toBe('OWN');
    }
  });

  it('صلاحيات صندوق الوارد موجودة في المصفوفة (قرار D4 — بلا صلاحيات جديدة)', () => {
    for (const key of ['complaints:triage', 'ideas:review', 'offers:decide']) {
      expect(PERMISSIONS.some((p) => p.key === key), key).toBe(true);
    }
  });
});
