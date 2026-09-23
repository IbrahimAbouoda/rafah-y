import { describe, expect, it } from 'vitest';
import {
  formatAccessCode,
  generateAccessCode,
  hashAccessCode,
  normalizeAccessCode,
  verifyAccessCode,
  verifyAgainstDecoy,
} from '@/lib/complaints/access-code';
import { canTransition, isTerminal, nextStatuses, transitionPermission, TRANSITIONS } from '@/lib/complaints/workflow';
import { sniffMime } from '@/lib/files';
import type { ComplaintStatus } from '@/lib/generated/prisma/enums';
import { gazaDayStart } from '@/lib/utils';
import { COMPLAINT_STATUSES, SubmitComplaintSchema, TrackSchema } from '@/lib/validation/complaints';

// Sprint 1 — وحدة: جدول الانتقالات (§5.1) · رمز المتابعة · فحص الملفات · المخططات

// §5.1 كما هو في الوثيقة: [من، إلى، الصلاحية]
const ALLOWED: [ComplaintStatus, ComplaintStatus, string][] = [
  ['SUBMITTED', 'UNDER_REVIEW', 'complaints:triage'],
  ['UNDER_REVIEW', 'ASSIGNED', 'complaints:triage'],
  ['UNDER_REVIEW', 'DISMISSED', 'complaints:close'],
  ['ASSIGNED', 'COMMITTEE_REVIEW', 'complaints:update_status'],
  ['COMMITTEE_REVIEW', 'REFERRED', 'complaints:refer'],
  ['COMMITTEE_REVIEW', 'IN_PROGRESS', 'complaints:update_status'],
  ['REFERRED', 'WAITING_RESPONSE', 'complaints:update_status'],
  ['WAITING_RESPONSE', 'IN_PROGRESS', 'complaints:update_status'],
  ['IN_PROGRESS', 'WAITING_RESPONSE', 'complaints:update_status'],
  ['IN_PROGRESS', 'RESOLVED', 'complaints:update_status'],
  ['RESOLVED', 'CLOSED', 'complaints:close'],
];

describe('جدول انتقالات الشكوى — PRD §5.1', () => {
  it.each(ALLOWED)('%s → %s مسموح بـ %s', (from, to, permission) => {
    expect(transitionPermission(from, to)).toBe(permission);
  });

  it('كل انتقال غير مذكور في المسار مرفوض (100 زوج)', () => {
    const allowed = new Set(ALLOWED.map(([f, t]) => `${f}>${t}`));
    let rejected = 0;
    for (const from of COMPLAINT_STATUSES) {
      for (const to of COMPLAINT_STATUSES) {
        if (allowed.has(`${from}>${to}`)) continue;
        expect(canTransition(from, to), `${from} → ${to}`).toBe(false);
        rejected += 1;
      }
    }
    expect(rejected).toBe(100 - ALLOWED.length);
  });

  it('الجدول لا يحوي انتقالًا خارج الوثيقة', () => {
    const count = Object.values(TRANSITIONS).reduce((n, list) => n + list.length, 0);
    expect(count).toBe(ALLOWED.length);
  });

  it('المغلقة والمستبعدة نهائيتان — لا عودة منهما', () => {
    expect(isTerminal('CLOSED')).toBe(true);
    expect(isTerminal('DISMISSED')).toBe(true);
    expect(canTransition('CLOSED', 'IN_PROGRESS')).toBe(false);
    expect(canTransition('DISMISSED', 'UNDER_REVIEW')).toBe(false);
  });

  it('لا قفز فوق مرحلة: من المستلمة إلى الحل مباشرة مرفوض', () => {
    expect(canTransition('SUBMITTED', 'RESOLVED')).toBe(false);
    expect(canTransition('ASSIGNED', 'RESOLVED')).toBe(false);
    expect(canTransition('SUBMITTED', 'ASSIGNED')).toBe(false);
  });

  it('nextStatuses يفصل الانتقالات بحسب الصلاحية', () => {
    expect(nextStatuses('IN_PROGRESS', 'complaints:update_status').sort()).toEqual(['RESOLVED', 'WAITING_RESPONSE']);
    expect(nextStatuses('UNDER_REVIEW', 'complaints:close')).toEqual(['DISMISSED']);
    expect(nextStatuses('COMMITTEE_REVIEW', 'complaints:triage')).toEqual([]);
  });
});

describe('رمز المتابعة — §5.1 خطوة 3 · AC-02', () => {
  it('8 خانات من أبجدية بلا محارف ملتبسة', () => {
    for (let i = 0; i < 200; i++) expect(generateAccessCode()).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(formatAccessCode('ABCDEFGH')).toBe('ABCD-EFGH');
  });

  it('يُخزَّن مجزّأً فقط، والتحقق يقبل كتابة المستخدم الطبيعية', async () => {
    const code = generateAccessCode();
    const hash = await hashAccessCode(code);
    expect(hash).not.toContain(code);
    expect(hash).toMatch(/^scrypt\$/);
    expect(await verifyAccessCode(formatAccessCode(code).toLowerCase(), hash)).toBe(true);
    expect(normalizeAccessCode(' ab cd-ef gh ')).toBe('ABCDEFGH');
  });

  it('الرمز الخاطئ والتجزئة التالفة يفشلان بلا استثناء', async () => {
    const hash = await hashAccessCode('ABCDEFGH');
    expect(await verifyAccessCode('ABCDEFGJ', hash)).toBe(false);
    expect(await verifyAccessCode('ABCDEFGH', 'garbage')).toBe(false);
    expect(await verifyAccessCode('ABCDEFGH', 'scrypt$$')).toBe(false);
  });

  it('التجزئة نفسها لا تتكرر لنفس الرمز (ملح لكل سجل)', async () => {
    expect(await hashAccessCode('ABCDEFGH')).not.toBe(await hashAccessCode('ABCDEFGH'));
  });

  it('المقارنة بالطُّعم عند غياب الرقم تفشل دائمًا وتستغرق زمن تحقق حقيقي', async () => {
    const hash = await hashAccessCode('ABCDEFGH');
    const t0 = performance.now();
    await verifyAccessCode('ABCDEFGH', hash);
    const real = performance.now() - t0;
    const t1 = performance.now();
    expect(await verifyAgainstDecoy('ABCDEFGH')).toBe(false);
    const decoy = performance.now() - t1;
    // نفس كلفة scrypt تقريبًا — لا طريق مختصر يكشف أن الرقم غير موجود
    expect(decoy).toBeGreaterThan(real * 0.3);
  });
});

describe('فحص نوع الملف بمحتواه — §6.5', () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
  const text = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
  it('يتعرّف على الأنواع الأربعة المسموحة', () => {
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffMime(text('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffMime(text('%PDF-1.7\n'))).toBe('application/pdf');
  });
  it('يرفض ما عداها ولو حمل امتدادًا مسموحًا', () => {
    expect(sniffMime(text('<html><script>'))).toBeNull();
    expect(sniffMime(text('MZ\x90\0'))).toBeNull();
    expect(sniffMime(text('GIF89a'))).toBeNull();
    expect(sniffMime(new Uint8Array())).toBeNull();
  });
});

describe('مخطط تقديم الشكوى — §6.3 · AC-01 ①', () => {
  const base = {
    clientDraftId: '7f7e6d6c-5b5a-4949-8a8a-1b1c1d1e1f20',
    title: 'انقطاع المياه في المنطقة',
    body: 'المياه مقطوعة منذ أسبوع كامل عن الحي بأكمله.',
    categoryId: '0b0c0d0e-0f10-4111-9213-141516171819',
  };

  it('يقبل الحد الأدنى', () => {
    expect(SubmitComplaintSchema.safeParse(base).success).toBe(true);
  });

  it('رسالة عربية لكل حقل ناقص', () => {
    const r = SubmitComplaintSchema.safeParse({ clientDraftId: base.clientDraftId, title: '', body: 'قصير', categoryId: '' });
    expect(r.success).toBe(false);
    const fields = r.success ? {} : r.error.flatten().fieldErrors;
    expect(fields.title?.[0]).toMatch(/عنوان/);
    expect(fields.body?.[0]).toMatch(/20 محرفًا/);
    expect(fields.categoryId?.[0]).toMatch(/تصنيف/);
  });

  it('الحدود: العنوان ≤ 200 · النص ≤ 5000', () => {
    expect(SubmitComplaintSchema.safeParse({ ...base, title: 'ع'.repeat(201) }).success).toBe(false);
    expect(SubmitComplaintSchema.safeParse({ ...base, body: 'ن'.repeat(5001) }).success).toBe(false);
  });

  it('المجهولة لا تحمل بيانات تواصل — §6.7', () => {
    const r = SubmitComplaintSchema.safeParse({ ...base, isAnonymous: 'on', contactPhone: '0599000000' });
    expect(r.success).toBe(false);
    expect(r.success ? '' : r.error.flatten().fieldErrors.isAnonymous?.[0]).toMatch(/مجهولة/);
  });

  it('وسيلة التواصل المختارة تتطلب قيمتها', () => {
    const r = SubmitComplaintSchema.safeParse({ ...base, preferredChannel: 'EMAIL' });
    expect(r.success ? '' : r.error.flatten().fieldErrors.contactEmail?.[0]).toMatch(/بريدك/);
  });

  it('مخطط التتبّع يطبّع ما يكتبه المستخدم', () => {
    const r = TrackSchema.parse({ reference: ' rf-cmp-2026-000124 ', accessCode: 'abcd-efgh' });
    expect(r).toEqual({ reference: 'RF-CMP-2026-000124', accessCode: 'ABCDEFGH' });
    expect(TrackSchema.safeParse({ reference: 'CMP-1', accessCode: 'x' }).success).toBe(false);
  });
});

describe('بداية اليوم بتوقيت غزة (فلتر سجل التدقيق)', () => {
  it('شتاءً +02 وصيفًا +03', () => {
    expect(gazaDayStart('2026-01-15')?.toISOString()).toBe('2026-01-14T22:00:00.000Z');
    expect(gazaDayStart('2026-07-15')?.toISOString()).toBe('2026-07-14T21:00:00.000Z');
    expect(gazaDayStart('غير-تاريخ')).toBeNull();
  });
});
