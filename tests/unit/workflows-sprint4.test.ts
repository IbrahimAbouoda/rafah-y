import { describe, expect, it } from 'vitest';
import {
  attendanceBlocker,
  canMoveActivity,
  canRate,
  ratingSummary,
  registerBlocker,
  registrationStatusFor,
} from '@/lib/activities/workflow';
import {
  APPLICANT_DATA_POINTS,
  applyBlocker,
  isOpenOpportunity,
  nextApplicationStatuses,
  OPPORTUNITY_REVIEW,
  PROFILE_DATA_POINTS,
  publishBlocker,
} from '@/lib/opportunities/workflow';
import { gazaDateTime, toDateTimeInput } from '@/lib/utils';
import { ActivitySchema, OpportunitySchema, ProfileSchema, RateSchema } from '@/lib/validation/opportunities';

// Sprint 4 — منطق خالص: مسار الفرصة والطلب والنشاط، والتحقق

const NOW = new Date('2026-10-01T10:00:00Z');
const hour = 3600_000;

describe('الفرصة — §5.4 · AC-11', () => {
  const base = { status: 'PUBLISHED' as const, applyMode: 'INTERNAL' as const, deadline: null };

  it('المنشورة الداخلية بلا موعد تقبل الطلب', () => {
    expect(applyBlocker(base, NOW)).toBeNull();
  });

  it('④ المنتهي موعدها · الخارجية · غير المنشورة: مرفوضة بسبب عربي', () => {
    expect(applyBlocker({ ...base, deadline: new Date(NOW.getTime() - hour) }, NOW)).toMatch(/انتهى موعد/);
    expect(applyBlocker({ ...base, applyMode: 'EXTERNAL' }, NOW)).toMatch(/رابط الجهة/);
    expect(applyBlocker({ ...base, status: 'PENDING_REVIEW' }, NOW)).toMatch(/غير منشورة/);
    expect(applyBlocker({ ...base, status: 'CLOSED' }, NOW)).toMatch(/أُغلقت/);
  });

  it('بوابة الفرص: المنشورة التي لم ينتهِ موعدها فقط', () => {
    expect(isOpenOpportunity({ status: 'PUBLISHED', deadline: new Date(NOW.getTime() + hour) }, NOW)).toBe(true);
    expect(isOpenOpportunity({ status: 'PUBLISHED', deadline: new Date(NOW.getTime() - hour) }, NOW)).toBe(false);
    expect(isOpenOpportunity({ status: 'PENDING_REVIEW', deadline: null }, NOW)).toBe(false);
  });

  it('المراجعة: من PENDING_REVIEW إلى نشر أو رفض فقط', () => {
    expect(OPPORTUNITY_REVIEW.PENDING_REVIEW).toEqual(['PUBLISHED', 'REJECTED']);
    expect(OPPORTUNITY_REVIEW.PUBLISHED).toEqual([]);
  });

  it('لا تُنشر فرصة مضى موعدها قبل مراجعتها؛ بلا موعد أو بموعد قادم تُنشر', () => {
    expect(publishBlocker({ deadline: new Date(NOW.getTime() - hour) }, NOW)).toMatch(/انتهى موعد التقديم.*ارفضها/);
    expect(publishBlocker({ deadline: new Date(NOW.getTime() + hour) }, NOW)).toBeNull();
    expect(publishBlocker({ deadline: null }, NOW)).toBeNull();
  });

  it('D33: طلب بلا موافقة لا تديره المؤسسة؛ المحسوم لا يُنقل', () => {
    expect(nextApplicationStatuses('SUBMITTED', false)).toEqual([]);
    expect(nextApplicationStatuses('SUBMITTED', true)).toEqual(['UNDER_REVIEW', 'ACCEPTED', 'REJECTED']);
    expect(nextApplicationStatuses('ACCEPTED', true)).toEqual([]);
    expect(nextApplicationStatuses('WITHDRAWN', true)).toEqual([]);
  });

  it('D31: ما يعرضه ConsentDialog يشمل التواصل، والطلب يضيف الرسالة فقط', () => {
    expect(PROFILE_DATA_POINTS.some((d) => d.includes('بريدك') && d.includes('جوّالك'))).toBe(true);
    expect(APPLICANT_DATA_POINTS).toEqual([...PROFILE_DATA_POINTS, 'رسالتك المرفقة بالطلب']);
  });
});

describe('النشاط — §5.5 · AC-13', () => {
  const published = { status: 'PUBLISHED' as const, registrationOpen: true, startsAt: new Date(NOW.getTime() + 24 * hour) };

  it('① المقاعد تُحترم: بعد امتلائها WAITLISTED، وبلا حد REGISTERED دائمًا', () => {
    expect(registrationStatusFor(0, 2)).toBe('REGISTERED');
    expect(registrationStatusFor(1, 2)).toBe('REGISTERED');
    expect(registrationStatusFor(2, 2)).toBe('WAITLISTED');
    expect(registrationStatusFor(500, null)).toBe('REGISTERED');
  });

  it('التسجيل: منشور ومفتوح وقبل البدء فقط', () => {
    expect(registerBlocker(published, NOW)).toBeNull();
    expect(registerBlocker({ ...published, status: 'DRAFT' }, NOW)).toMatch(/غير منشور/);
    expect(registerBlocker({ ...published, registrationOpen: false }, NOW)).toMatch(/مغلق/);
    expect(registerBlocker({ ...published, startsAt: new Date(NOW.getTime() - hour) }, NOW)).toMatch(/بدأ النشاط/);
  });

  it('الحضور بعد البدء فقط، والتقييم من الحاضر فقط', () => {
    expect(attendanceBlocker(published, NOW)).toMatch(/لم يبدأ/);
    expect(attendanceBlocker({ status: 'PUBLISHED', startsAt: new Date(NOW.getTime() - hour) }, NOW)).toBeNull();
    expect(attendanceBlocker({ status: 'DRAFT', startsAt: new Date(NOW.getTime() - hour) }, NOW)).toMatch(/منشور أو منتهٍ/);
    expect(canRate('ATTENDED')).toBe(true);
    for (const s of ['REGISTERED', 'WAITLISTED', 'NO_SHOW', 'CANCELLED'] as const) expect(canRate(s)).toBe(false);
  });

  it('ملخص التقييم: من صار «لم يحضر» يبقى تقييمه مخزّنًا ولا يُحتسب', () => {
    const rows = [
      { status: 'ATTENDED' as const, rating: 5 },
      { status: 'ATTENDED' as const, rating: 3 },
      { status: 'NO_SHOW' as const, rating: 1 },
      { status: 'ATTENDED' as const, rating: null },
    ];
    const { average, rated } = ratingSummary(rows);
    expect(average).toBe(4);
    expect(rated).toHaveLength(2);
    expect(ratingSummary([{ status: 'NO_SHOW' as const, rating: 2 }]).average).toBeNull();
  });

  it('الانتقالات: المسودة تُنشر، والمنتهي والملغى نهائيان', () => {
    expect(canMoveActivity('DRAFT', 'PUBLISHED')).toBe(true);
    expect(canMoveActivity('PUBLISHED', 'COMPLETED')).toBe(true);
    expect(canMoveActivity('DRAFT', 'COMPLETED')).toBe(false);
    expect(canMoveActivity('COMPLETED', 'PUBLISHED')).toBe(false);
    expect(canMoveActivity('CANCELLED', 'PUBLISHED')).toBe(false);
  });
});

describe('التحقق — Sprint 4', () => {
  const opp = {
    organizationId: '00000000-0000-4000-8000-000000000001',
    title: 'تدريب في التصميم',
    description: 'وصف كافٍ لفرصة تدريب عملية مدتها ثلاثة أشهر.',
    type: 'TRAINING',
    applyMode: 'INTERNAL',
    skillIds: [],
  };

  it('الفرصة الخارجية بلا رابط مرفوضة، والرابط يجب أن يكون http(s)', () => {
    const r = OpportunitySchema.safeParse({ ...opp, applyMode: 'EXTERNAL' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['externalUrl']);
    expect(OpportunitySchema.safeParse({ ...opp, applyMode: 'EXTERNAL', externalUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(OpportunitySchema.safeParse({ ...opp, applyMode: 'EXTERNAL', externalUrl: 'https://example.org/apply' }).success).toBe(true);
  });

  it('آخر موعد بتاريخ فقط = نهاية ذلك اليوم بتوقيت غزة، والموعد الماضي مرفوض', () => {
    const next = new Date(Date.now() + 10 * 24 * hour);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza' }).format(next);
    const parsed = OpportunitySchema.parse({ ...opp, deadline: day });
    expect(toDateTimeInput(parsed.deadline)).toBe(`${day}T23:59`);
    expect(OpportunitySchema.safeParse({ ...opp, deadline: '2020-01-01' }).success).toBe(false);
  });

  it('موعد النشاط يُقرأ بتوقيت غزة لا بتوقيت الخادم (+03 صيفًا)', () => {
    expect(gazaDateTime('2026-08-10T14:30')?.toISOString()).toBe('2026-08-10T11:30:00.000Z');
    expect(toDateTimeInput(new Date('2026-08-10T11:30:00Z'))).toBe('2026-08-10T14:30');
    const a = ActivitySchema.safeParse({
      committeeId: '00000000-0000-4000-8000-000000000002',
      title: 'ورشة تجريبية',
      kind: 'WORKSHOP',
      startsAt: '2026-08-10T14:30',
      endsAt: '2026-08-10T12:00',
      partnerIds: [],
    });
    expect(a.success).toBe(false);
    expect(a.error?.issues[0]?.path).toEqual(['endsAt']);
  });

  it('D34: النشاط بلا لجنة مرفوض', () => {
    const r = ActivitySchema.safeParse({ title: 'نشاط بلا لجنة', kind: 'ACTIVITY', startsAt: '2026-08-10T10:00', partnerIds: [] });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path[0] === 'committeeId')).toBe(true);
  });

  it('التقييم خارج 1–5 مرفوض برسالة عربية', () => {
    const id = '00000000-0000-4000-8000-000000000003';
    expect(RateSchema.safeParse({ activityId: id, rating: '0' }).success).toBe(false);
    expect(RateSchema.safeParse({ activityId: id, rating: '6' }).success).toBe(false);
    expect(RateSchema.safeParse({ activityId: id, rating: '5' }).success).toBe(true);
  });

  it('الملف: اللغات بفواصل عربية أو لاتينية بلا تكرار، وسنة الميلاد فقط', () => {
    const p = ProfileSchema.parse({ languages: 'العربية، الإنجليزية, العربية', interests: '', skills: [] });
    expect(p.languages).toEqual(['العربية', 'الإنجليزية']);
    expect(p.interests).toEqual([]);
    expect(p.jobSeeking).toBe(false);
    expect(ProfileSchema.safeParse({ birthYear: '1890', languages: '', interests: '', skills: [] }).success).toBe(false);
  });
});
