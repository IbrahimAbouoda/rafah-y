import { createHash, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { submitComplaintAction } from '@/server/actions/complaints/submit';
import { confirmUploadAction, createUploadUrlAction, getDownloadUrlAction } from '@/server/actions/files';
import { assignToCommitteeAction, openForTriageAction } from '@/server/actions/complaints/workflow';
import { actAs, categoryId, committeeId, createUser, form, freshIp } from '../support/factories';

// الرفع الآمن — PRD §6.5. التخزين الحقيقي (Supabase Storage) يُستبدل بذاكرة: الاختبار يفحص قرارات الخادم لا الشبكة.
const objects = new Map<string, Uint8Array>();
vi.mock('@/lib/storage', () => ({
  COMPLAINT_BUCKET: 'complaint-attachments',
  createSignedUpload: vi.fn(async (path: string) => ({ signedUrl: `memory://${path}`, token: 'test-token' })),
  downloadObject: vi.fn(async (path: string) => objects.get(path) ?? null),
  removeObject: vi.fn(async (path: string) => void objects.delete(path)),
  createSignedDownload: vi.fn(async (path: string) => `memory://download/${path}`),
}));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(1)]);
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

async function newComplaint(anonymous = false) {
  const youth = await createUser(['youth']);
  await actAs(youth.id);
  const res = await submitComplaintAction({
    clientDraftId: randomUUID(),
    title: 'شكوى بمرفق',
    body: 'تفاصيل كافية لشكوى تحمل صورة مرفقة للتوضيح.',
    categoryId: await categoryId(),
    isAnonymous: anonymous ? 'on' : undefined,
  });
  return { youth, ...res!.data! };
}

async function upload(reference: string, accessCode: string, bytes: Uint8Array, mimeType = 'image/png') {
  const ticket = await createUploadUrlAction({
    reference,
    accessCode,
    fileName: 'photo.png',
    mimeType,
    sizeBytes: bytes.byteLength,
    sha256: sha(bytes),
  });
  if (ticket?.ok && ticket.data) objects.set(ticket.data.path, bytes);
  return ticket;
}

beforeEach(() => {
  freshIp();
});

describe('createUploadUrl · confirmUpload', () => {
  it('صاحب الرقم والرمز يرفع، والملف يُتحقق منه من التخزين ثم ينتقل CLEAN بالفاحص الوهمي', async () => {
    const c = await newComplaint();
    await actAs(null);
    const ticket = await upload(c.reference, c.accessCode, PNG);
    expect(ticket).toMatchObject({ ok: true });
    const file = await db.fileObject.findUniqueOrThrow({ where: { id: ticket!.data!.fileId } });
    expect(file).toMatchObject({ complaintId: c.id, uploadedById: c.youth.id, scan: 'PENDING', isPublic: false });
    expect(file.path).toMatch(new RegExp(`^complaints/${c.id}/[0-9a-f-]+\\.png$`));

    expect(await confirmUploadAction({ reference: c.reference, accessCode: c.accessCode, fileId: file.id })).toMatchObject({ ok: true });
    await vi.waitFor(async () => {
      expect((await db.fileObject.findUniqueOrThrow({ where: { id: file.id } })).scan).toBe('CLEAN');
    }, { timeout: 3000 });
  });

  it('مرفق الشكوى المجهولة بلا uploadedById (§6.7)', async () => {
    const c = await newComplaint(true);
    const ticket = await upload(c.reference, c.accessCode, PNG);
    const file = await db.fileObject.findUniqueOrThrow({ where: { id: ticket!.data!.fileId } });
    expect(file.uploadedById).toBeNull();
  });

  it('تأكيد الرفع محدود لكل IP مثل /track: تخمين الرمز عبره يتوقف بعد 10 محاولات', async () => {
    const c = await newComplaint();
    const guess = { reference: c.reference, accessCode: 'AAAA-AAAA', fileId: randomUUID() };
    for (let i = 0; i < 10; i++) expect(await confirmUploadAction(guess)).toMatchObject({ ok: false, message: expect.stringMatching(/لم نجد شكوى/) });
    expect(await confirmUploadAction(guess)).toMatchObject({ ok: false, message: expect.stringMatching(/محاولات كثيرة/) });
  });

  it('رمز خاطئ: نفس رسالة التتبّع، ولا سجل ملف', async () => {
    const c = await newComplaint();
    const before = await db.fileObject.count();
    const res = await upload(c.reference, 'AAAA-AAAA', PNG);
    expect(res).toMatchObject({ ok: false, message: expect.stringMatching(/لم نجد شكوى/) });
    expect(await db.fileObject.count()).toBe(before);
  });

  it('النوع خارج القائمة البيضاء والحجم فوق 5 م.ب مرفوضان قبل إصدار الرابط', async () => {
    const c = await newComplaint();
    const gif = await createUploadUrlAction({
      reference: c.reference,
      accessCode: c.accessCode,
      fileName: 'a.gif',
      mimeType: 'image/gif',
      sizeBytes: 10,
      sha256: 'a'.repeat(64),
    });
    expect(gif).toMatchObject({ ok: false, fieldErrors: { mimeType: expect.any(Array) } });
    const big = await createUploadUrlAction({
      reference: c.reference,
      accessCode: c.accessCode,
      fileName: 'a.png',
      mimeType: 'image/png',
      sizeBytes: 5 * 1024 * 1024 + 1,
      sha256: 'a'.repeat(64),
    });
    expect(big).toMatchObject({ ok: false, fieldErrors: { sizeBytes: expect.any(Array) } });
  });

  it('ملف يتنكّر بامتداد صورة: يُحذف من التخزين ويُعلَّم FAILED', async () => {
    const c = await newComplaint();
    const fake = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    const ticket = await upload(c.reference, c.accessCode, fake);
    const res = await confirmUploadAction({ reference: c.reference, accessCode: c.accessCode, fileId: ticket!.data!.fileId });
    expect(res).toMatchObject({ ok: false, message: expect.stringMatching(/لا يطابق نوعه/) });
    expect(objects.has(ticket!.data!.path)).toBe(false);
    const file = await db.fileObject.findFirstOrThrow({ where: { id: ticket!.data!.fileId, deletedAt: { not: null } } });
    expect(file.scan).toBe('FAILED');
  });

  it('5 ملفات لكل شكوى كحد أقصى', async () => {
    const c = await newComplaint();
    for (let i = 0; i < 5; i++) expect(await upload(c.reference, c.accessCode, PNG)).toMatchObject({ ok: true });
    expect(await upload(c.reference, c.accessCode, PNG)).toMatchObject({ ok: false, message: expect.stringMatching(/الحد الأقصى/) });
  });

  it('لا إرفاق بعد خروج الشكوى من SUBMITTED', async () => {
    const c = await newComplaint();
    const secretary = await createUser(['secretary']);
    await actAs(secretary.id);
    await openForTriageAction(null, form({ complaintId: c.id }));
    expect(await upload(c.reference, c.accessCode, PNG)).toMatchObject({ ok: false, message: expect.stringMatching(/انتهت فترة إرفاق/) });
  });
});

describe('getDownloadUrl — §6.5 · file.download', () => {
  async function cleanFileOnAssigned(slug: string) {
    const c = await newComplaint();
    const ticket = await upload(c.reference, c.accessCode, PNG);
    await db.fileObject.update({ where: { id: ticket!.data!.fileId }, data: { scan: 'CLEAN' } });
    const secretary = await createUser(['secretary']);
    await actAs(secretary.id);
    await openForTriageAction(null, form({ complaintId: c.id }));
    await assignToCommitteeAction(null, form({ complaintId: c.id, committeeId: await committeeId(slug) }));
    return { ...c, fileId: ticket!.data!.fileId };
  }

  it('عضو اللجنة المسؤولة ينزّل، وتُكتب file.download', async () => {
    const c = await cleanFileOnAssigned('health-affairs');
    const member = await createUser([{ key: 'committee_member', committee: 'health-affairs' }]);
    await actAs(member.id);
    expect(await getDownloadUrlAction(null, form({ fileId: c.fileId }))).toMatchObject({ ok: true, data: { url: expect.any(String) } });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'file.download', entityId: c.fileId } });
    expect(audit.actorId).toBe(member.id);
  });

  it('لجنة أخرى مرفوضة، وملف قيد الفحص لا يُنزَّل', async () => {
    const c = await cleanFileOnAssigned('health-affairs');
    const outsider = await createUser([{ key: 'committee_member', committee: 'sports-arts' }]);
    await actAs(outsider.id);
    expect(await getDownloadUrlAction(null, form({ fileId: c.fileId }))).toMatchObject({ ok: false, message: expect.stringMatching(/لا تملك صلاحية/) });

    await db.fileObject.update({ where: { id: c.fileId }, data: { scan: 'PENDING' } });
    const president = await createUser(['council_president']);
    await actAs(president.id);
    expect(await getDownloadUrlAction(null, form({ fileId: c.fileId }))).toMatchObject({ ok: false, message: expect.stringMatching(/قيد الفحص/) });
    expect(await db.auditLog.count({ where: { action: 'file.download', entityId: c.fileId } })).toBe(0);
  });
});
