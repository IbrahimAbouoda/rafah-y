import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { can } from '@/lib/rbac';
import { saveAreaAction, saveCategoryAction, saveCommitteeAction } from '@/server/actions/settings/reference';
import { startTermAction } from '@/server/actions/settings/terms';
import { actAs, createUser, form, session } from '../support/factories';

const slug = () => `test-${randomUUID().slice(0, 8)}`;

describe('اللجان — committees:manage', () => {
  it('المدير التقني يضيف لجنة ويعدّلها، وكل تغيير يكتب settings.change', async () => {
    const admin = await createUser(['super_admin']);
    await actAs(admin.id);
    const s = slug();
    expect(await saveCommitteeAction(null, form({ slug: s, nameAr: 'لجنة اختبار', isActive: 'on', sortOrder: '10' }))).toMatchObject({ ok: true });
    const c = await db.committee.findUniqueOrThrow({ where: { slug: s } });

    await saveCommitteeAction(null, form({ id: c.id, slug: s, nameAr: 'لجنة اختبار معدّلة', sortOrder: '11' }));
    const updated = await db.committee.findUniqueOrThrow({ where: { id: c.id } });
    expect(updated).toMatchObject({ nameAr: 'لجنة اختبار معدّلة', isActive: false });

    const audits = await db.auditLog.findMany({ where: { entityType: 'Committee', entityId: c.id }, orderBy: { id: 'asc' } });
    expect(audits.map((a) => a.action)).toEqual(['settings.change', 'settings.change']);
    expect(audits[1]?.before).toMatchObject({ nameAr: 'لجنة اختبار' });
  });

  it('معرّف مكرر يُرفض برسالة عربية', async () => {
    const admin = await createUser(['super_admin']);
    await actAs(admin.id);
    const res = await saveCommitteeAction(null, form({ slug: 'legal-affairs', nameAr: 'مكررة', sortOrder: '0' }));
    expect(res).toMatchObject({ ok: false });
    expect(res?.message).toMatch(/مستخدمة/);
  });

  it('رئيس المجلس لا يدير اللجان (الصلاحية للمدير التقني وحده)', async () => {
    const president = await createUser(['council_president']);
    await actAs(president.id);
    const res = await saveCommitteeAction(null, form({ slug: slug(), nameAr: 'محاولة', sortOrder: '0' }));
    expect(res?.message).toMatch(/لا تملك صلاحية/);
  });
});

describe('التصنيفات والمناطق — settings:manage', () => {
  it('يرفض لجنة مقترحة معطّلة', async () => {
    const admin = await createUser(['super_admin']);
    await actAs(admin.id);
    const off = await db.committee.create({ data: { slug: slug(), nameAr: 'معطّلة', isActive: false } });
    const res = await saveCategoryAction(null, form({ nameAr: `تصنيف ${slug()}`, defaultCommitteeId: off.id, sortOrder: '0' }));
    expect(res).toMatchObject({ ok: false, fieldErrors: { defaultCommitteeId: expect.any(Array) } });
  });

  it('يمنع حلقة في شجرة المناطق', async () => {
    const admin = await createUser(['super_admin']);
    await actAs(admin.id);
    const parent = await db.area.create({ data: { nameAr: `منطقة ${slug()}` } });
    const child = await db.area.create({ data: { nameAr: `حي ${slug()}`, parentId: parent.id } });
    const res = await saveAreaAction(null, form({ id: parent.id, nameAr: parent.nameAr, parentId: child.id }));
    expect(res).toMatchObject({ ok: false, fieldErrors: { parentId: expect.any(Array) } });
  });

  it('أمين السر لا يغيّر إعدادات النظام', async () => {
    const sec = await createUser(['secretary']);
    await actAs(sec.id);
    expect((await saveAreaAction(null, form({ nameAr: 'محاولة' })))?.message).toMatch(/لا تملك صلاحية/);
  });
});

describe('دورات المجلس — AC-16 ③', () => {
  it('الدورة الجديدة تُنهي أدوار السابقة دون حذف، وتكتب term.change', async () => {
    const president = await createUser(['council_president']);
    const member = await createUser([{ key: 'committee_member', committee: 'sports-arts' }]);
    const youth = await createUser(['youth']);
    const previous = await db.councilTerm.findFirstOrThrow({ where: { isCurrent: true } });
    const assignmentsBefore = await db.roleAssignment.count();

    await actAs(president.id);
    const res = await startTermAction(null, form({ name: `دورة اختبار ${slug()}`, startsAt: '2026-10-01' }));
    expect(res).toMatchObject({ ok: true });

    const current = await db.councilTerm.findMany({ where: { isCurrent: true } });
    expect(current).toHaveLength(1);
    expect(current[0]?.id).not.toBe(previous.id);
    expect((await db.councilTerm.findUniqueOrThrow({ where: { id: previous.id } })).isCurrent).toBe(false);

    expect(await db.roleAssignment.count()).toBe(assignmentsBefore);
    expect((await session(member.id)).grants.size).toBe(0);
    expect((await session(president.id)).grants.size).toBe(0);
    expect(can(await session(youth.id), 'complaints:create')).toBe(true);

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'term.change', entityId: current[0]!.id } });
    expect(audit.before).toMatchObject({ id: previous.id, isCurrent: true });
  });

  it('غير المخوَّل لا يبدأ دورة', async () => {
    const vp = await createUser(['vice_president']);
    await actAs(vp.id);
    const before = await db.councilTerm.count();
    expect((await startTermAction(null, form({ name: 'محاولة', startsAt: '2026-10-01' })))?.message).toMatch(/لا تملك صلاحية/);
    expect(await db.councilTerm.count()).toBe(before);
  });
});
