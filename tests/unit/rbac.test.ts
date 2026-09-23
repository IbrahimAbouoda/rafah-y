import { describe, expect, it } from 'vitest';
import { buildGrants, can, roleLabels, type AssignmentRow, type SessionUser } from '@/lib/rbac';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const ME = '00000000-0000-4000-8000-0000000000aa';
const OTHER = '00000000-0000-4000-8000-0000000000bb';

function assignment(committeeId: string | null, perms: [string, 'OWN' | 'COMMITTEE' | 'ALL'][]): AssignmentRow {
  return {
    committeeId,
    committee: committeeId ? { slug: committeeId === A ? 'a' : 'b', nameAr: 'لجنة' } : null,
    endsAt: null,
    role: { key: 'r', nameAr: 'دور', permissions: perms.map(([key, scope]) => ({ scope, permission: { key } })) },
  };
}

function user(assignments: AssignmentRow[]): SessionUser {
  return {
    id: ME,
    authId: ME,
    fullName: 'اختبار',
    email: null,
    phone: null,
    roles: assignments.map((a) => ({
      key: a.role.key,
      nameAr: a.role.nameAr,
      committeeId: a.committeeId,
      committeeSlug: a.committee?.slug ?? null,
      committeeNameAr: a.committee?.nameAr ?? null,
      endsAt: null,
    })),
    grants: buildGrants(assignments),
  };
}

describe('can()', () => {
  it('يرفض مستخدمًا غير مسجّل', () => {
    expect(can(null, 'complaints:read')).toBe(false);
  });

  it('يرفض صلاحية غير ممنوحة بأي نطاق', () => {
    const u = user([assignment(null, [['complaints:read', 'ALL']])]);
    expect(can(u, 'complaints:triage')).toBe(false);
    expect(can(u, 'complaints:triage', { committeeId: A })).toBe(false);
  });

  it('بلا سياق: صحيح إن كانت الصلاحية ممنوحة بأي نطاق (الفحص المبكر)', () => {
    const u = user([assignment(A, [['tasks:approve', 'COMMITTEE']])]);
    expect(can(u, 'tasks:approve')).toBe(true);
  });

  it('ALL يشمل أي سجل، حتى سجلًا بلا لجنة', () => {
    const u = user([assignment(null, [['complaints:update_status', 'ALL']])]);
    expect(can(u, 'complaints:update_status', { committeeId: B })).toBe(true);
    expect(can(u, 'complaints:update_status', { committeeId: null })).toBe(true);
  });

  it('COMMITTEE: رئيس لجنة لا يصل لسجل لجنة أخرى (AC-04 ①)', () => {
    const u = user([assignment(A, [['complaints:update_status', 'COMMITTEE']])]);
    expect(can(u, 'complaints:update_status', { committeeId: A })).toBe(true);
    expect(can(u, 'complaints:update_status', { committeeId: B })).toBe(false);
    expect(can(u, 'complaints:update_status', { committeeId: null })).toBe(false);
  });

  it('COMMITTEE مقيّد بالتعيين الذي حمل المنحة: رئيس في A وعضو في B لا يعتمد مهام B', () => {
    const u = user([
      assignment(A, [['tasks:approve', 'COMMITTEE'], ['tasks:read', 'COMMITTEE']]),
      assignment(B, [['tasks:read', 'COMMITTEE']]),
    ]);
    expect(can(u, 'tasks:approve', { committeeId: A })).toBe(true);
    expect(can(u, 'tasks:approve', { committeeId: B })).toBe(false);
    expect(can(u, 'tasks:read', { committeeId: B })).toBe(true);
  });

  it('OWN: ما أنشأه أو أُسند إليه فقط', () => {
    const u = user([assignment(null, [['tasks:update', 'OWN']])]);
    expect(can(u, 'tasks:update', { ownerId: ME })).toBe(true);
    expect(can(u, 'tasks:update', { ownerId: OTHER })).toBe(false);
    expect(can(u, 'tasks:update', { ownerId: [OTHER, ME] })).toBe(true);
    expect(can(u, 'tasks:update', { ownerId: null })).toBe(false);
  });

  it('OWN لا يكفي لسجل لجنة لم يُسند إليه', () => {
    const u = user([assignment(A, [['tasks:update', 'OWN']])]);
    expect(can(u, 'tasks:update', { committeeId: A, ownerId: OTHER })).toBe(false);
  });

  it('أوسع نطاق يغلب عند تعدد التعيينات', () => {
    const u = user([assignment(A, [['complaints:read', 'COMMITTEE']]), assignment(null, [['complaints:read', 'ALL']])]);
    expect(can(u, 'complaints:read', { committeeId: B })).toBe(true);
  });
});

describe('roleLabels()', () => {
  it('يلتقط الدور واللجنة للقطة التدقيق', () => {
    const u = user([assignment(A, [['tasks:read', 'COMMITTEE']]), assignment(null, [])]);
    expect(roleLabels(u)).toEqual(['r@a', 'r']);
  });
});
