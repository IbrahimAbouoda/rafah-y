import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { nextRef } from '@/lib/sequence';
import { createUser, session } from '../support/factories';

// قيود sql/constraints.sql من خلال Prisma — الحماية الأخيرة لو تجاوز أحدهم طبقة التطبيق

describe('سجل التدقيق إلحاقي فقط — AC-19 ②', () => {
  it('UPDATE و DELETE على audit_logs يفشلان من قاعدة البيانات', async () => {
    const u = await createUser(['secretary']);
    const s = await session(u.id);
    await db.$transaction((tx) => writeAudit(tx, s, 'settings.change', 'Test', 'x', null, { a: 1 }));
    await expect(db.$executeRaw`UPDATE audit_logs SET action = 'tampered'`).rejects.toThrow(/append-only/);
    await expect(db.$executeRaw`DELETE FROM audit_logs`).rejects.toThrow(/append-only/);
    await expect(db.auditLog.deleteMany({})).rejects.toThrow();
    await expect(db.$executeRaw`TRUNCATE audit_logs`).rejects.toThrow(/append-only/);
  });

  it('حذف مستخدم بلا أسطر تدقيق ممكن، وحذف منفّذ له أسطر يُرفض ويبقى سطره كما هو (AC-20)', async () => {
    const clean = await createUser();
    await expect(db.user.delete({ where: { id: clean.id } })).resolves.toMatchObject({ id: clean.id });

    // بلا دور: تعيين الدور نفسه يمنع الحذف (RESTRICT) قبل أن يصل الأمر إلى سطر التدقيق
    const actor = await createUser();
    const s = await session(actor.id);
    await db.$transaction((tx) => writeAudit(tx, s, 'settings.change', 'Test', 'kept', null, {}));
    await expect(db.user.delete({ where: { id: actor.id } })).rejects.toThrow(/append-only/);
    expect(await db.auditLog.count({ where: { actorId: actor.id, entityId: 'kept' } })).toBe(1);
  });

  it('تغيّر دور المنفّذ لاحقًا لا يغيّر لقطة أدواره في السطور القديمة — AC-19 ③', async () => {
    const u = await createUser(['secretary']);
    const s = await session(u.id);
    await db.$transaction((tx) => writeAudit(tx, s, 'settings.change', 'Test', 'snap', null, {}));
    await db.roleAssignment.updateMany({ where: { userId: u.id }, data: { revokedAt: new Date() } });
    const row = await db.auditLog.findFirstOrThrow({ where: { actorId: u.id, entityId: 'snap' } });
    expect(row.actorRoles).toEqual(['secretary']);
  });

  it('فشل المعاملة يُسقط سطر التدقيق معها', async () => {
    const before = await db.auditLog.count();
    await expect(
      db.$transaction(async (tx) => {
        await writeAudit(tx, null, 'settings.change', 'Test', 'rollback', null, {});
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await db.auditLog.count()).toBe(before);
  });
});

describe('nextRef() — أساس AC-01 ②④', () => {
  it('الصيغة RF-CMP-YYYY-NNNNNN و RF-DEC-YYYY-NNNN', async () => {
    const [cmp, dec] = await db.$transaction(async (tx) => [await nextRef(tx, 'CMP'), await nextRef(tx, 'DEC')]);
    expect(cmp).toMatch(/^RF-CMP-\d{4}-\d{6}$/);
    expect(dec).toMatch(/^RF-DEC-\d{4}-\d{4}$/);
  });

  it('طلبات متزامنة لا تنتج رقمًا مكررًا', async () => {
    const refs = await Promise.all(Array.from({ length: 15 }, () => db.$transaction((tx) => nextRef(tx, 'IDA'))));
    expect(new Set(refs).size).toBe(refs.length);
    for (const r of refs) expect(r).toMatch(/^RF-IDA-\d{4}-\d{6}$/);
  });
});

describe('دورة حالية واحدة — council_terms_one_current', () => {
  it('قاعدة البيانات ترفض دورة حالية ثانية', async () => {
    await expect(db.councilTerm.create({ data: { name: 'ثانية', startsAt: new Date(), isCurrent: true } })).rejects.toThrow();
  });
});
