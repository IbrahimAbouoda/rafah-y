import { describe, expect, it } from 'vitest';
import { assignmentStatus } from '@/lib/assignments';
import { toAuditJson } from '@/lib/audit';
import { decryptField, encryptField } from '@/lib/crypto';
import { Prisma } from '@/lib/generated/prisma/client';
import { loginBackoffSec } from '@/lib/rate-limit';
import { safeNextPath } from '@/lib/request';
import { localYear } from '@/lib/sequence';

const KEY = Buffer.alloc(32, 3).toString('base64');

describe('تشفير بيانات التواصل — PRD §6.6', () => {
  it('يعيد النص الأصلي', () => {
    const enc = encryptField('+970599000000', KEY);
    expect(Buffer.from(enc).toString('utf8')).not.toContain('599');
    expect(decryptField(enc, KEY)).toBe('+970599000000');
  });
  it('نفس النص يُشفَّر مختلفًا في كل مرة', () => {
    expect(Buffer.from(encryptField('x', KEY)).equals(Buffer.from(encryptField('x', KEY)))).toBe(false);
  });
  it('يكشف التلاعب بالبيانات', () => {
    const enc = encryptField('سرّي', KEY);
    enc[enc.length - 1]! ^= 1;
    expect(() => decryptField(enc, KEY)).toThrow();
  });
  it('يرفض مفتاحًا خاطئًا', () => {
    expect(() => decryptField(encryptField('x', KEY), Buffer.alloc(32, 4).toString('base64'))).toThrow();
  });
  it('يرفض مفتاحًا بطول غير 32 بايت', () => {
    expect(() => encryptField('x', Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
  });
});

describe('toAuditJson', () => {
  it('يحوّل الأنواع الخاصة إلى JSON ولا ينسخ البايتات المشفّرة', () => {
    const d = new Date('2026-09-23T10:00:00Z');
    expect(
      toAuditJson({ at: d, n: 10n, amount: new Prisma.Decimal('7400.50'), enc: new Uint8Array([1, 2]), list: [d], nil: undefined }),
    ).toEqual({ at: d.toISOString(), n: '10', amount: '7400.5', enc: '[encrypted]', list: [d.toISOString()], nil: null });
  });
});

describe('حالة تعيين الدور', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  const base = { startsAt: new Date('2026-01-01'), endsAt: null, revokedAt: null, role: { isTermBound: true }, term: { isCurrent: true } };
  it('فعّال', () => expect(assignmentStatus(base, now)).toBe('active'));
  it('مؤقت (إنابة)', () => expect(assignmentStatus({ ...base, endsAt: new Date('2026-10-01') }, now)).toBe('expiring'));
  it('منتهٍ', () => expect(assignmentStatus({ ...base, endsAt: new Date('2026-09-01') }, now)).toBe('inactive'));
  it('مسحوب', () => expect(assignmentStatus({ ...base, revokedAt: now }, now)).toBe('revoked'));
  it('دورة غير حالية', () => expect(assignmentStatus({ ...base, term: { isCurrent: false } }, now)).toBe('inactive'));
  it('دور غير مرتبط بدورة يبقى فعّالًا', () =>
    expect(assignmentStatus({ ...base, role: { isTermBound: false }, term: null }, now)).toBe('active'));
});

describe('حد المعدل لتسجيل الدخول — PRD §6.4', () => {
  it('لا تأخير قبل 5 إخفاقات، ثم يتضاعف حتى 60 دقيقة', () => {
    expect(loginBackoffSec(4)).toBe(0);
    expect(loginBackoffSec(5)).toBe(60);
    expect(loginBackoffSec(6)).toBe(120);
    expect(loginBackoffSec(8)).toBe(480);
    expect(loginBackoffSec(20)).toBe(3600);
  });
});

describe('safeNextPath', () => {
  it('يقبل المسارات الداخلية فقط', () => {
    expect(safeNextPath('/admin/settings/users')).toBe('/admin/settings/users');
    expect(safeNextPath('https://evil.test')).toBeNull();
    expect(safeNextPath('//evil.test')).toBeNull();
    expect(safeNextPath('/\\evil.test')).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });
});

describe('سنة الرقم المرجعي بتوقيت غزة', () => {
  it('ليلة رأس السنة بتوقيت UTC هي السنة الجديدة في غزة', () => {
    expect(localYear(new Date('2026-12-31T23:30:00Z'))).toBe(2027);
    expect(localYear(new Date('2026-06-01T00:00:00Z'))).toBe(2026);
  });
});
