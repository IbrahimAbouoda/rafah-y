import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { can } from '@/lib/rbac';
import { committeeId, createUser, session } from '../support/factories';

// PRD §3.2 — التعيينات الفعّالة ونطاق اللجنة من قاعدة البيانات

describe('loadSessionUser', () => {
  it('يحمّل منح الدور من المصفوفة المزروعة', async () => {
    const u = await createUser(['secretary']);
    const s = await session(u.id);
    expect(can(s, 'complaints:triage', { committeeId: null })).toBe(true);
    expect(can(s, 'ideas:approve')).toBe(false);
  });

  it('يستبعد الدور المسحوب', async () => {
    const u = await createUser([{ key: 'secretary', revoked: true }]);
    expect((await session(u.id)).grants.size).toBe(0);
  });

  it('يستبعد الدور المنتهي ويُبقي المؤقت الساري (الإنابة)', async () => {
    const expired = await createUser([{ key: 'council_president', endsAt: new Date(Date.now() - 60_000) }]);
    const acting = await createUser([{ key: 'council_president', endsAt: new Date(Date.now() + 86_400_000) }]);
    expect(can(await session(expired.id), 'ideas:approve')).toBe(false);
    expect(can(await session(acting.id), 'ideas:approve')).toBe(true);
  });

  it('يستبعد الدور الذي لم يبدأ بعد', async () => {
    const u = await createUser([{ key: 'secretary', startsAt: new Date(Date.now() + 86_400_000) }]);
    expect((await session(u.id)).grants.size).toBe(0);
  });

  it('نطاق اللجنة من تعيين الدورة الحالية فقط', async () => {
    const legal = await committeeId('legal-affairs');
    const health = await committeeId('health-affairs');
    const u = await createUser([{ key: 'committee_head', committee: 'legal-affairs' }]);
    const s = await session(u.id);
    expect(can(s, 'complaints:update_status', { committeeId: legal })).toBe(true);
    expect(can(s, 'complaints:update_status', { committeeId: health })).toBe(false);
    expect(s.roles[0]).toMatchObject({ key: 'committee_head', committeeSlug: 'legal-affairs' });
  });

  it('الدور المرتبط بدورة يتوقف حين لا تكون دورته حالية', async () => {
    const u = await createUser(['vice_president']);
    const oldTerm = await db.councilTerm.create({ data: { name: 'دورة سابقة للاختبار', startsAt: new Date('2024-01-01'), isCurrent: false } });
    await db.roleAssignment.updateMany({ where: { userId: u.id }, data: { termId: oldTerm.id } });
    expect((await session(u.id)).grants.size).toBe(0);
  });

  it('دور الشاب غير مرتبط بدورة فيبقى فعّالًا', async () => {
    const u = await createUser(['youth']);
    expect(can(await session(u.id), 'complaints:create')).toBe(true);
  });

  it('الحساب المعطّل أو المحذوف لا يُحمَّل', async () => {
    const off = await createUser(['secretary']);
    await db.user.update({ where: { id: off.id }, data: { isActive: false } });
    const gone = await createUser(['secretary']);
    await db.user.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    const { loadSessionUser } = await import('@/lib/session');
    expect(await loadSessionUser(db, off.id)).toBeNull();
    expect(await loadSessionUser(db, gone.id)).toBeNull();
  });
});

describe('الحذف الناعم عبر $extends', () => {
  it('يستبعد المحذوف من القراءات، ويُقرأ صراحةً عند طلبه', async () => {
    const u = await createUser();
    await db.user.update({ where: { id: u.id }, data: { deletedAt: new Date() } });
    expect(await db.user.findFirst({ where: { id: u.id } })).toBeNull();
    expect(await db.user.count({ where: { id: u.id } })).toBe(0);
    expect(await db.user.findFirst({ where: { id: u.id, deletedAt: { not: null } } })).not.toBeNull();
  });
});
