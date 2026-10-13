import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { POST as assign } from '@/app/api/mobile/v1/admin/complaints/[id]/assign/route';
import { POST as contact } from '@/app/api/mobile/v1/admin/complaints/[id]/contact/route';
import { POST as dismiss } from '@/app/api/mobile/v1/admin/complaints/[id]/dismiss/route';
import { POST as openTriage } from '@/app/api/mobile/v1/admin/complaints/[id]/open-triage/route';
import { GET as complaintFile } from '@/app/api/mobile/v1/admin/complaints/[id]/route';
import { POST as status } from '@/app/api/mobile/v1/admin/complaints/[id]/status/route';
import { GET as complaintList } from '@/app/api/mobile/v1/admin/complaints/route';
import { GET as inbox } from '@/app/api/mobile/v1/admin/inbox/route';
import { GET as myComplaint } from '@/app/api/mobile/v1/me/complaints/[ref]/route';
import { GET as myComplaints, POST as submit } from '@/app/api/mobile/v1/me/complaints/route';
import { POST as publicSubmit } from '@/app/api/mobile/v1/public/complaints/route';
import { POST as track } from '@/app/api/mobile/v1/public/track/route';
import { db } from '@/lib/db';
import { call } from '../../support/api';
import { actAs, categoryId, committeeId, createUser, freshIp } from '../../support/factories';

// واجهة الجوّال — الشكاوى: نفس منطق Server Actions عبر Bearer، بحالات HTTP ورسائل عربية

type Submitted = { id: string; reference: string; accessCode: string; duplicate: boolean };

async function input(overrides: Record<string, unknown> = {}) {
  return {
    clientDraftId: randomUUID(),
    title: 'انقطاع الإنارة في الشارع',
    body: 'الإنارة معطلة منذ أسبوعين في الشارع الرئيسي، والمكان مظلم ليلًا.',
    categoryId: await categoryId(),
    ...overrides,
  };
}

async function youthWithComplaint(overrides: Record<string, unknown> = {}) {
  const youth = await createUser(['youth'], 'شاب');
  await actAs(youth.id);
  const res = await call<Submitted>(submit, { body: await input(overrides) });
  expect(res.status).toBe(201);
  return { youth, ...res.data };
}

beforeEach(() => {
  freshIp();
});

describe('POST /public/complaints — شكوى زائر', () => {
  it('201 بلا رمز، submitterId = NULL، والرقم من الخادم', async () => {
    await actAs(null);
    const res = await call<Submitted>(publicSubmit, { auth: false, body: await input() });
    expect(res.status).toBe(201);
    expect(res.data.reference).toMatch(/^RF-CMP-\d{4}-\d{6}$/);
    expect(res.message).toMatch(/احفظ الرقم والرمز/);
    const row = await db.complaint.findUniqueOrThrow({ where: { id: res.data.id } });
    expect(row.submitterId).toBeNull();
  });

  it('AC-17 ②: نفس clientDraftId ثلاث مرات = شكوى واحدة بالرقم نفسه', async () => {
    const body = await input();
    const refs = new Set<string>();
    for (let i = 0; i < 3; i++) refs.add((await call<Submitted>(publicSubmit, { auth: false, body })).data.reference);
    expect(refs.size).toBe(1);
    expect(await db.complaint.count({ where: { clientDraftId: body.clientDraftId } })).toBe(1);
  });

  it('D21: الثالثة من نفس IP خلال ساعة ← 429 مع Retry-After', async () => {
    for (let i = 0; i < 2; i++) expect((await call(publicSubmit, { auth: false, body: await input() })).status).toBe(201);
    const res = await call(publicSubmit, { auth: false, body: await input() });
    expect(res.status).toBe(429);
    expect(res.error?.code).toBe('RATE_LIMITED');
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('422 بأخطاء الحقول العربية', async () => {
    const res = await call(publicSubmit, { auth: false, body: { title: '' } });
    expect(res.status).toBe(422);
    expect(res.error?.message_ar).toMatch(/بعض الحقول تحتاج تصحيحًا/);
    expect(res.error?.field_errors).toBeDefined();
  });

  it('422 لجسم ليس JSON', async () => {
    const { NextRequest } = await import('next/server');
    const res = await publicSubmit(
      new NextRequest('http://test.local/x', { method: 'POST', body: '{not json', headers: { 'content-type': 'application/json' } }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(422);
  });
});

describe('POST /public/track — AC-02', () => {
  it('الرقم والرمز الصحيحان ← الأحداث العامة فقط', async () => {
    const s = await youthWithComplaint();
    const res = await call<{ reference: string; events: unknown[] }>(track, {
      auth: false,
      body: { reference: s.reference, accessCode: s.accessCode },
    });
    expect(res.status).toBe(200);
    expect(res.data.reference).toBe(s.reference);
  });

  it('رمز خاطئ ← 404 برسالة واحدة لا تكشف أيّهما الخاطئ', async () => {
    const s = await youthWithComplaint();
    const res = await call(track, { auth: false, body: { reference: s.reference, accessCode: 'AAAA-BBBB' } });
    expect(res.status).toBe(404);
    expect(res.error?.message_ar).toMatch(/لم نجد شكوى بهذا الرقم وهذا الرمز معًا/);
  });
});

describe('/me/complaints', () => {
  it('401 بلا رمز', async () => {
    await actAs(null);
    expect((await call(myComplaints, { auth: false })).status).toBe(401);
    expect((await call(submit, { auth: false, body: await input() })).status).toBe(401);
  });

  it('403 لمستخدم بلا complaints:create، قبل التحقق من المدخلات', async () => {
    const nobody = await createUser([]);
    await actAs(nobody.id);
    const res = await call(submit, { body: {} });
    expect(res.status).toBe(403);
    expect(res.error?.code).toBe('FORBIDDEN');
  });

  it('القائمة والتفصيل لصاحبها، وشكوى غيره 404', async () => {
    const s = await youthWithComplaint();
    const list = await call<{ items: { reference: string }[]; total: number; page: number }>(myComplaints);
    expect(list.data.items.map((c) => c.reference)).toEqual([s.reference]);
    expect(list.data.page).toBe(1);

    const detail = await call<{ reference: string; events: unknown[] }>(myComplaint, {
      params: { ref: s.reference.toLowerCase() },
    });
    expect(detail.status).toBe(200);
    expect(detail.data.events).toHaveLength(1);

    const other = await createUser(['youth']);
    await actAs(other.id);
    expect((await call(myComplaint, { params: { ref: s.reference } })).status).toBe(404);
  });
});

describe('/admin/complaints — نطاق اللجنة (AC-03 · AC-04)', () => {
  it('الشاب لا يفتح الملف الداخلي لشكواه ولا قائمة المجلس — 403', async () => {
    const s = await youthWithComplaint();
    expect((await call(complaintFile, { params: { id: s.id } })).status).toBe(403);
    expect((await call(complaintList)).status).toBe(403);
  });

  it('فرز ← تحويل ← رئيس لجنة أخرى 404/403 ← رئيس اللجنة يحدّث الحالة', async () => {
    const s = await youthWithComplaint();
    const secretary = await createUser(['secretary']);
    await actAs(secretary.id);

    // الأقدم أولًا: في القاعدة المشتركة قد لا تقع الجديدة في الصفحة الأولى — آخر صفحة تحويها
    const first = await call<{ total: number; pageSize: number }>(inbox, { query: { pageSize: '50' } });
    const last = Math.max(1, Math.ceil(first.data.total / 50));
    const box = await call<{ items: { id: string }[] }>(inbox, { query: { pageSize: '50', page: String(last) } });
    expect(box.data.items.some((c) => c.id === s.id)).toBe(true);

    const file = await call<{ actions: { openForTriage: boolean } }>(complaintFile, { params: { id: s.id } });
    expect(file.data.actions.openForTriage).toBe(true);

    expect((await call(openTriage, { params: { id: s.id }, body: {} })).status).toBe(200);
    const legal = await committeeId('legal-affairs');
    const assigned = await call(assign, { params: { id: s.id }, body: { committeeId: legal } });
    expect(assigned.status).toBe(200);
    expect(assigned.message).toMatch(/حُوّلت الشكوى/);

    const otherHead = await createUser([{ key: 'committee_head', committee: 'health-affairs' }]);
    await actAs(otherHead.id);
    expect((await call(complaintFile, { params: { id: s.id } })).status).toBe(404);
    expect((await call(status, { params: { id: s.id }, body: { toStatus: 'COMMITTEE_REVIEW' } })).status).toBe(403);

    const head = await createUser([{ key: 'committee_head', committee: 'legal-affairs' }]);
    await actAs(head.id);
    const moved = await call(status, { params: { id: s.id }, body: { toStatus: 'COMMITTEE_REVIEW' } });
    expect(moved.status).toBe(200);
    expect((await db.complaint.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('COMMITTEE_REVIEW');
    expect(await db.auditLog.count({ where: { entityId: s.id, action: 'complaint.status_change' } })).toBe(1);
  });

  it('انتقال غير مسموح في المسار ← 422 برسالة تشرح الحالة', async () => {
    const s = await youthWithComplaint();
    const secretary = await createUser(['secretary']);
    await actAs(secretary.id);
    const res = await call(dismiss, { params: { id: s.id }, body: { reason: 'سبب الاستبعاد مكتوب بوضوح' } });
    expect(res.status).toBe(422);
    expect(res.error?.message_ar).toMatch(/لا يمكن نقل الشكوى/);
  });

  it('بيانات التواصل: بصلاحيتها وسطر تدقيق، وبلا تخزين', async () => {
    const s = await youthWithComplaint({ contactName: 'اسم تجريبي', contactPhone: '0599000001', preferredChannel: 'PHONE' });
    const president = await createUser(['council_president']);
    await actAs(president.id);
    const res = await call<{ name: string; phone: string }>(contact, { params: { id: s.id }, body: {} });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ name: 'اسم تجريبي', phone: '0599000001' });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await db.auditLog.count({ where: { entityId: s.id, action: 'complaint.contact_read' } })).toBe(1);

    const youth = await createUser(['youth']);
    await actAs(youth.id);
    expect((await call(contact, { params: { id: s.id }, body: {} })).status).toBe(403);
  });
});
