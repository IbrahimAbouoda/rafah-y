import { createHash, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as downloadUrl } from '@/app/api/mobile/v1/files/[id]/download-url/route';
import { POST as submitComplaint } from '@/app/api/mobile/v1/me/complaints/route';
import { POST as confirm } from '@/app/api/mobile/v1/public/complaints/files/confirm/route';
import { POST as uploadUrl } from '@/app/api/mobile/v1/public/complaints/files/upload-url/route';
import { db } from '@/lib/db';
import { call } from '../../support/api';
import { actAs, categoryId, createUser, freshIp } from '../../support/factories';

// واجهة الجوّال — المرفقات (§6.5): رابط رفع موقّع ← رفع مباشر للتخزين ← تأكيد بالبصمة والنوع الحقيقي ← فحص ← تنزيل موقّع

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

type Ticket = { fileId: string; path: string; signedUrl: string; token: string };

beforeEach(() => {
  freshIp();
});

describe('مرفقات الشكوى عبر الجوّال', () => {
  it('رفع ← تأكيد ← فحص ← تنزيل لصاحب الصلاحية فقط', async () => {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    const submitted = await call<{ id: string; reference: string; accessCode: string }>(submitComplaint, {
      body: {
        clientDraftId: randomUUID(),
        title: 'تسرب مياه في الشارع',
        body: 'تسرب مياه من خط رئيسي منذ أيام والمياه تتجمع أمام البيوت.',
        categoryId: await categoryId(),
      },
    });
    const { reference, accessCode, id } = submitted.data;

    // الرفع بالرقم والرمز — بلا رمز وصول (يعمل للمسودة المتزامنة والزائر)
    await actAs(null);
    const ticket = await call<Ticket>(uploadUrl, {
      auth: false,
      body: { reference, accessCode, fileName: 'photo.png', mimeType: 'image/png', sizeBytes: PNG.byteLength, sha256: sha(PNG) },
    });
    expect(ticket.status).toBe(200);
    objects.set(ticket.data.path, PNG);

    const wrongCode = await call(confirm, { auth: false, body: { reference, accessCode: 'AAAA-BBBB', fileId: ticket.data.fileId } });
    expect(wrongCode.status).toBe(404);

    expect((await call(confirm, { auth: false, body: { reference, accessCode, fileId: ticket.data.fileId } })).status).toBe(200);
    await vi.waitFor(async () => {
      expect((await db.fileObject.findUniqueOrThrow({ where: { id: ticket.data.fileId } })).scan).toBe('CLEAN');
    });

    const president = await createUser(['council_president']);
    await actAs(president.id);
    const url = await call<{ url: string }>(downloadUrl, { params: { id: ticket.data.fileId }, body: {} });
    expect(url.status).toBe(200);
    expect(url.data.url).toMatch(/^memory:\/\/download\//);
    expect(await db.auditLog.count({ where: { action: 'file.download', entityId: ticket.data.fileId } })).toBe(1);

    const outsider = await createUser([{ key: 'committee_head', committee: 'health-affairs' }]);
    await actAs(outsider.id);
    expect((await call(downloadUrl, { params: { id: ticket.data.fileId }, body: {} })).status).toBeGreaterThanOrEqual(403);
    expect(id).toBeTruthy();
  });

  it('محتوى لا يطابق نوعه ← 422 ويُحذف الملف', async () => {
    const youth = await createUser(['youth']);
    await actAs(youth.id);
    const { data } = await call<{ reference: string; accessCode: string }>(submitComplaint, {
      body: { clientDraftId: randomUUID(), title: 'مرفق مزيف', body: 'ملف نصي متنكر في صورة لاختبار الفحص.', categoryId: await categoryId() },
    });
    const fake = new TextEncoder().encode('not really a png file at all, just text');
    const ticket = await call<Ticket>(uploadUrl, {
      auth: false,
      body: { ...data, fileName: 'x.png', mimeType: 'image/png', sizeBytes: fake.byteLength, sha256: sha(fake) },
    });
    objects.set(ticket.data.path, fake);
    const res = await call(confirm, { auth: false, body: { ...data, fileId: ticket.data.fileId } });
    expect(res.status).toBe(422);
    expect(res.error?.message_ar).toMatch(/لا يطابق نوعه/);
    expect(objects.has(ticket.data.path)).toBe(false);
  });
});
