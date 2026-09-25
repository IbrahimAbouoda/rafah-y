import { describe, expect, it } from 'vitest';
import { conceptNoteDraft } from '@/lib/concept-notes';
import {
  coveredStatus,
  fromCents,
  INITIATIVE_TRANSITIONS,
  initiativeTransitionPermission,
  PUBLIC_INITIATIVE_STATUSES,
  securedTotals,
  toCents,
} from '@/lib/initiatives/workflow';

// Sprint 3 — وحدة: المبلغ المؤمَّن (§5.3) · تغطية الاحتياج · مسار المبادرة (D25) · قالب Concept Note

const row = (direction: 'INCOMING' | 'OUTGOING', amount: string, approved: boolean, currency = 'ILS') => ({
  direction,
  amount,
  currency,
  approvedAt: approved ? new Date() : null,
});

describe('المبلغ المؤمَّن = مجموع القيود الواردة المعتمدة فقط', () => {
  it('يستبعد غير المعتمد والمصروف', () => {
    expect(
      securedTotals([row('INCOMING', '1000', true), row('INCOMING', '500', false), row('OUTGOING', '300', true), row('INCOMING', '0.50', true)]),
    ).toEqual({ ILS: '1000.50' });
  });
  it('يفصل العملات ولا يجمع الشيكل بالدولار', () => {
    expect(securedTotals([row('INCOMING', '100', true), row('INCOMING', '40.25', true, 'USD')])).toEqual({ ILS: '100.00', USD: '40.25' });
  });
  it('بلا قيود معتمدة = لا شيء (لا صفر مضلل)', () => {
    expect(securedTotals([row('INCOMING', '100', false)])).toEqual({});
  });
  it('الحساب بالقروش بلا أخطاء فاصلة عائمة', () => {
    const many = Array.from({ length: 10 }, () => row('INCOMING', '0.10', true));
    expect(securedTotals(many)).toEqual({ ILS: '1.00' });
    expect(toCents('12.5')).toBe(1250n);
    expect(fromCents(123456n)).toBe('1234.56');
  });
});

describe('تغطية الاحتياج بالعروض المقبولة', () => {
  it('غير المالي يُغطّى بعرض مقبول واحد', () => {
    expect(coveredStatus({ type: 'VENUE', amount: null }, [{ amount: null, currency: 'ILS' }])).toBe('COVERED');
    expect(coveredStatus({ type: 'VENUE', amount: null }, [])).toBe('OPEN');
  });
  it('المالي: جزئيًا حتى يبلغ المقبول مبلغه بعملته', () => {
    const need = { type: 'FUNDING' as const, amount: '2000' };
    expect(coveredStatus(need, [{ amount: '1500', currency: 'ILS' }])).toBe('PARTIALLY_COVERED');
    expect(coveredStatus(need, [{ amount: '1500', currency: 'ILS' }, { amount: '500', currency: 'ILS' }])).toBe('COVERED');
    expect(coveredStatus(need, [{ amount: '5000', currency: 'USD' }])).toBe('PARTIALLY_COVERED');
  });
});

describe('مسار المبادرة — §5.3 · D25', () => {
  it('النشر من «بانتظار الاعتماد» وحدها وبـ initiatives:approve وحدها — لا مرحلة بلدية', () => {
    const toPublished = Object.entries(INITIATIVE_TRANSITIONS).flatMap(([from, list]) =>
      list.filter((t) => t.to === 'PUBLISHED').map((t) => [from, t.permission]),
    );
    expect(toPublished).toEqual([['PENDING_APPROVAL', 'initiatives:approve']]);
    expect(initiativeTransitionPermission('DRAFT', 'PUBLISHED')).toBeNull();
  });
  it('المسودة وبانتظار الاعتماد ليستا عامتين · المكتملة والملغاة نهائيتان', () => {
    expect(PUBLIC_INITIATIVE_STATUSES).not.toContain('DRAFT');
    expect(PUBLIC_INITIATIVE_STATUSES).not.toContain('PENDING_APPROVAL');
    expect(INITIATIVE_TRANSITIONS.COMPLETED).toEqual([]);
    expect(INITIATIVE_TRANSITIONS.CANCELLED).toEqual([]);
  });
});

describe('قالب Concept Note — AC-12 ③ · C16', () => {
  it('يحمل المجال وعدد المصوّتين ويصرّح بأنه مسودة لا تُرسل قبل الاعتماد', () => {
    const d = conceptNoteDraft({
      pollTitle: 'فرصة عمل... كيف أكون؟',
      pollDescription: null,
      optionLabel: 'برمجة الويب',
      voterCount: 60,
      totalVoters: 120,
      threshold: 50,
    });
    expect(d.title).toBe('مقترح تدريب: برمجة الويب');
    expect(d.bodyMd).toContain('**60**');
    expect(d.bodyMd).toContain('50٪');
    expect(d.bodyMd).toContain('لا تُرسل لأي جهة قبل اعتماد رئيس المجلس');
  });
});
