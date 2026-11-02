import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { loadSessionUser } from '@/lib/session';
import { deleteAuthIdentity } from '@/lib/supabase/admin';
import { ANONYMIZED_NAME, anonymizedEmail } from '@/lib/users/erase';
import { ERASE_ACCOUNT_CONFIRMATION } from '@/lib/validation/settings';
import { submitComplaintAction } from '@/server/actions/complaints/submit';
import { anonymizeUserAction, deleteMyAccountAction } from '@/server/actions/settings/accounts';
import { actAs, categoryId, createUser, form } from '../support/factories';

// Sprint 6 · Q13 (قرار 2026-09-30): حساب بلا أثر يُحذف فعليًا، وما له أثر يُجهَّل ويُعطَّل، وهوية الدخول تُحذف في الحالتين.

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: vi.fn(), deleteAuthIdentity: vi.fn(async () => {}) }));
const signOut = vi.fn(async () => ({ error: null }));
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: vi.fn(async () => ({ auth: { signOut } })) }));

const confirmed = (extra: Record<string, string> = {}) => form({ confirm: ERASE_ACCOUNT_CONFIRMATION, ...extra });
const auditFor = (userId: string) =>
  db.auditLog.findFirst({ where: { entityType: 'User', entityId: userId, action: { in: ['user.delete', 'user.anonymize'] } } });
const anyUser = (id: string) => db.user.findFirst({ where: { id, deletedAt: undefined } });

/** شاب قدّم شكوى ببيانات تواصل: له سطر تدقيق (complaint.create) وسجل يشير إليه */
async function youthWithComplaint() {
  const youth = await createUser(['youth'], 'شاب اسمه معروف');
  await db.user.update({ where: { id: youth.id }, data: { phone: `+97059${Math.floor(1e6 + Math.random() * 8e6)}` } });
  await db.youthProfile.create({ data: { userId: youth.id, birthYear: 2004, interests: ['برمجة'] } });
  await actAs(youth.id);
  const res = await submitComplaintAction({
    clientDraftId: randomUUID(),
    title: 'شكوى صاحبها سيمحو حسابه',
    body: 'تفاصيل كافية لشكوى سيُجهَّل صاحبها لاحقًا.',
    categoryId: await categoryId(),
    contactName: 'اسم للتواصل',
    contactPhone: '0599000123',
    preferredChannel: 'PHONE',
  });
  expect(res).toMatchObject({ ok: true });
  const complaint = await db.complaint.findUniqueOrThrow({ where: { reference: res!.data!.reference } });
  return { youth, complaint };
}

beforeEach(() => {
  vi.mocked(deleteAuthIdentity).mockClear().mockImplementation(async () => {});
  signOut.mockClear();
});

describe('الحذف الفعلي — حساب بلا أثر', () => {
  it('شاب لم يفعل شيئًا يمحو حسابه: يُحذف السجل وتعيين التسجيل والملف، وسطر user.delete بلا منفّذ', async () => {
    const youth = await createUser(['youth']);
    await db.youthProfile.create({ data: { userId: youth.id, birthYear: 2005 } });
    await db.notification.create({ data: { userId: youth.id, type: 'COMPLAINT_STATUS_CHANGED', channel: 'IN_APP', title: 'تنبيه' } });
    await actAs(youth.id);

    const res = await deleteMyAccountAction(null, confirmed());
    expect(res).toMatchObject({ ok: true, message: expect.stringContaining('حُذف حسابك نهائيًا') });

    expect(await anyUser(youth.id)).toBeNull();
    expect(await db.roleAssignment.count({ where: { userId: youth.id } })).toBe(0);
    expect(await db.youthProfile.count({ where: { userId: youth.id } })).toBe(0);
    expect(await db.notification.count({ where: { userId: youth.id } })).toBe(0);
    expect(await auditFor(youth.id)).toMatchObject({ action: 'user.delete', actorId: null, actorRoles: ['system:self'] });
    expect(deleteAuthIdentity).toHaveBeenCalledWith(youth.authId);
    expect(signOut).toHaveBeenCalled();
  });
});

describe('التجهيل — حساب له أثر', () => {
  it('المدير يجهّل شابًا له شكوى: تُحجب البيانات المعرِّفة، ويتوقف الدخول، وتبقى الشكوى بلا صاحب وبلا بيانات تواصل', async () => {
    const { youth, complaint } = await youthWithComplaint();
    const before = await db.user.findUniqueOrThrow({ where: { id: youth.id } });
    expect(await db.complaintContact.count({ where: { complaintId: complaint.id } })).toBe(1);

    const admin = await createUser(['super_admin']);
    await actAs(admin.id);
    const res = await anonymizeUserAction(null, confirmed({ userId: youth.id }));
    expect(res).toMatchObject({ ok: true, message: expect.stringContaining('جُهِّل الحساب') });

    const after = await db.user.findFirstOrThrow({ where: { id: youth.id, deletedAt: undefined } });
    expect(after).toMatchObject({ email: anonymizedEmail(youth.id), phone: null, fullName: ANONYMIZED_NAME, isActive: false });
    expect(after.email).toMatch(/^anonymized_[0-9a-f]{16}@deleted\.invalid$/);
    expect(after.deletedAt).not.toBeNull();
    // الدخول متوقف: الجلسة لا تُحمَّل لحساب غير فعّال، وهوية Supabase حُذفت
    expect(await loadSessionUser(db, youth.id)).toBeNull();
    expect(deleteAuthIdentity).toHaveBeenCalledWith(youth.authId);

    expect(await db.complaint.findUniqueOrThrow({ where: { id: complaint.id } })).toMatchObject({ submitterId: null });
    expect(await db.complaintContact.count({ where: { complaintId: complaint.id } })).toBe(0);
    expect(await db.youthProfile.count({ where: { userId: youth.id } })).toBe(0);
    expect(await db.roleAssignment.count({ where: { userId: youth.id, revokedAt: null } })).toBe(0);

    const audit = await auditFor(youth.id);
    expect(audit).toMatchObject({ action: 'user.anonymize', actorId: admin.id });
    expect(audit!.after).toMatchObject({ mode: 'anonymized', complaintsDetached: 1, contactsDeleted: 1, rolesRevoked: 1 });
    // سطر التدقيق نفسه لا يحمل ما حُجب
    const json = JSON.stringify({ before: audit!.before, after: audit!.after, roles: audit!.actorRoles });
    for (const pii of [before.email!, before.phone!, before.fullName]) expect(json).not.toContain(pii);
  });

  it('الشاب يمحو حسابه وله شكوى: يُجهَّل لا يُحذف، والتدقيق بلا منفّذ', async () => {
    const { youth, complaint } = await youthWithComplaint();
    const res = await deleteMyAccountAction(null, confirmed());
    expect(res).toMatchObject({ ok: true, message: expect.stringContaining('جُهِّل حسابك') });
    expect(await anyUser(youth.id)).toMatchObject({ fullName: ANONYMIZED_NAME, isActive: false });
    expect(await db.complaint.findUniqueOrThrow({ where: { id: complaint.id } })).toMatchObject({ submitterId: null });
    expect(await auditFor(youth.id)).toMatchObject({ action: 'user.anonymize', actorId: null, actorRoles: ['system:self'] });
  });

  it('من حمل دورًا داخليًا يُجهَّل ولو لم يفعل شيئًا، وتاريخ أدواره يبقى مسحوبًا لا محذوفًا', async () => {
    const secretary = await createUser(['secretary']);
    const admin = await createUser(['super_admin']);
    await actAs(admin.id);
    expect(await anonymizeUserAction(null, confirmed({ userId: secretary.id }))).toMatchObject({ ok: true });
    const roles = await db.roleAssignment.findMany({ where: { userId: secretary.id } });
    expect(roles).toHaveLength(1);
    expect(roles[0]).toMatchObject({ revokedById: admin.id });
    expect(roles[0]!.revokedAt).not.toBeNull();
  });

  it('تعذّر حذف هوية الدخول: التجهيل يتم، والرسالة تطلب حذفها يدويًا', async () => {
    const { youth } = await youthWithComplaint();
    vi.mocked(deleteAuthIdentity).mockRejectedValueOnce(new Error('auth down'));
    const res = await deleteMyAccountAction(null, confirmed());
    expect(res).toMatchObject({ ok: true, message: expect.stringContaining('احذفها يدويًا') });
    expect(await anyUser(youth.id)).toMatchObject({ isActive: false });
  });
});

describe('الرفض', () => {
  it('بلا صلاحية users:manage_roles: رفض، والهدف كما هو، ولا حذف لهوية', async () => {
    const target = await createUser(['youth']);
    for (const roles of [['youth'], ['secretary']] as const) {
      const user = await createUser([...roles]);
      await actAs(user.id);
      expect(await anonymizeUserAction(null, confirmed({ userId: target.id }))).toMatchObject({
        ok: false,
        message: expect.stringMatching(/لا تملك صلاحية/),
      });
    }
    expect(await db.user.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ isActive: true, fullName: target.fullName });
    expect(deleteAuthIdentity).not.toHaveBeenCalled();
  });

  it('بلا دخول: رفض', async () => {
    await actAs(null);
    expect(await deleteMyAccountAction(null, confirmed())).toMatchObject({ ok: false, message: expect.stringMatching(/سجّل الدخول/) });
  });

  it('بلا عبارة التأكيد الحرفية: خطأ حقل ولا شيء يتغيّر', async () => {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    for (const confirm of [undefined, 'نعم', 'احذف الحساب']) {
      expect(await deleteMyAccountAction(null, form({ confirm }))).toMatchObject({
        ok: false,
        fieldErrors: { confirm: [expect.stringContaining(ERASE_ACCOUNT_CONFIRMATION)] },
      });
    }
    expect(await db.user.findUnique({ where: { id: youth.id } })).not.toBeNull();
  });

  it('الحساب المجهَّل لا يُمحى مرتين', async () => {
    const { youth } = await youthWithComplaint();
    const admin = await createUser(['super_admin']);
    await actAs(admin.id);
    expect(await anonymizeUserAction(null, confirmed({ userId: youth.id }))).toMatchObject({ ok: true });
    expect(await anonymizeUserAction(null, confirmed({ userId: youth.id }))).toMatchObject({ ok: false, message: expect.stringMatching(/غير موجود/) });
  });
});
