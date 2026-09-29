import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown, safeHref } from '@/lib/markdown';
import { lightStem, matchFaq, MAX_RESULTS, meaningfulTokens, MIN_SCORE, normalizeArabic, type FaqCandidate } from '@/lib/support/match';

// Sprint 5 — المحور ٥ (§17 بند 11): التطبيع العربي (§13.2) · ترتيب النتائج والحد الأدنى للتشابه · مُنقّي Markdown (§6.3)

describe('normalizeArabic — §13.2', () => {
  it('يحذف التشكيل والتطويل', () => {
    expect(normalizeArabic('مُقَدَّمَة')).toBe('مقدمه');
    expect(normalizeArabic('شـــكوى')).toBe('شكوي');
  });

  it('يوحّد أ إ آ ٱ ← ا، و ة ← ه، و ى ← ي', () => {
    expect(normalizeArabic('أإآٱ')).toBe('اااا');
    expect(normalizeArabic('مدرسة')).toBe('مدرسه');
    expect(normalizeArabic('مستشفى')).toBe('مستشفي');
  });

  it('يتجاهل الترقيم العربي واللاتيني ويضغط المسافات', () => {
    expect(normalizeArabic('كيف؟! أقدّم، شكوى…  (الآن)')).toBe('كيف اقدم شكوي الان');
  });

  it('الجذع الخفيف يوحّد «الشكوى» و «للشكوى» و «وبالشكوى» مع «شكوى»', () => {
    const base = lightStem(normalizeArabic('شكوى'));
    for (const w of ['الشكوى', 'للشكوى', 'وبالشكوى']) expect(lightStem(normalizeArabic(w))).toBe(base);
  });

  it('كلمات الاستفهام والربط لا تُحسب', () => {
    expect(meaningfulTokens('كيف هل ما في من')).toEqual([]);
  });
});

const E = (id: string, question: string, keywords: string[] = [], useCount = 0, answerMd = 'إجابة'): FaqCandidate => ({
  id,
  question,
  answerMd,
  keywords,
  useCount,
});

describe('matchFaq — الترتيب والحد الأدنى', () => {
  const entries = [
    E('complaint', 'كيف أقدّم شكوى؟', ['شكوى', 'تقديم شكوى'], 5),
    E('track', 'كيف أتابع شكواي؟', ['تتبع', 'رقم مرجعي'], 2),
    E('volunteer', 'كيف أصبح متطوعًا؟', ['تطوع']),
    E('answer-only', 'سؤال عام عن المجلس', [], 0, 'يمكنك تتبع طلبك من صفحة التتبع'),
  ];

  it('الكلمة المفتاحية الكاملة تسبق التطابق في نص السؤال', () => {
    const r = matchFaq('أريد تتبع طلبي', entries);
    expect(r[0]!.id).toBe('track');
    expect(r[0]!.score).toBeGreaterThanOrEqual(1);
  });

  it('التطبيع يجعل الإملاء المختلف يطابق: «كيف اقدم شكوي»', () => {
    expect(matchFaq('كيف اقدم شكوي', entries)[0]!.id).toBe('complaint');
  });

  it('تطابق نص الإجابة وحده لا يتجاوز الحد', () => {
    expect(matchFaq('طلبك صفحة', entries).map((m) => m.id)).not.toContain('answer-only');
  });

  it('سؤال بلا صلة ⇒ لا نتائج (لا نص مخترع — AC-18 ①)', () => {
    expect(matchFaq('ما سعر الطماطم اليوم', entries)).toEqual([]);
    expect(matchFaq('؟؟؟', entries)).toEqual([]);
    expect(matchFaq('كيف', entries)).toEqual([]);
  });

  it('ثلاث نتائج على الأكثر، وكلها فوق الحد، والتعادل يُحسم بالأكثر استخدامًا', () => {
    const many = Array.from({ length: 6 }, (_, i) => E(`e${i}`, `سؤال عن الانشطة رقم ${i}`, ['انشطة'], i));
    const r = matchFaq('الانشطة', many);
    expect(r).toHaveLength(MAX_RESULTS);
    expect(r.every((m) => m.score >= MIN_SCORE)).toBe(true);
    expect(r.map((m) => m.id)).toEqual(['e5', 'e4', 'e3']);
  });
});

describe('مُنقّي Markdown — §6.3', () => {
  const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

  it('وسوم HTML والسكربت تُعرض نصًا مهرّبًا', () => {
    const out = html('<script>alert(1)</script> <img src=x onerror=alert(1)> <b>x</b>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<b>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('javascript: و data: و //host لا تصير روابط', () => {
    for (const href of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', '//evil.example', 'vbscript:x']) {
      expect(safeHref(href), href).toBeNull();
      const out = html(`[اضغط](${href})`);
      expect(out).not.toContain('<a');
      expect(out).toContain('اضغط');
    }
  });

  it('روابط https خارجية بـ noopener، والداخلية بلا target', () => {
    expect(html('[موقع](https://example.org/x)')).toContain('rel="noopener noreferrer nofollow"');
    const internal = html('[تتبّع](/track)');
    expect(internal).toContain('href="/track"');
    expect(internal).not.toContain('target=');
    expect(safeHref('mailto:info@example.org')).toBe('mailto:info@example.org');
  });

  it('المجموعة الفرعية: عريض، مائل، قوائم، فقرات وأسطر', () => {
    const out = html('**مهم** و*مائل*\nسطر ثانٍ\n\n- أ\n- ب\n\n1. أول\n2. ثانٍ');
    expect(out).toContain('<strong>مهم</strong>');
    expect(out).toContain('<em>مائل</em>');
    expect(out).toContain('<br/>');
    expect(out).toMatch(/<ul[^>]*><li>أ<\/li><li>ب<\/li><\/ul>/);
    expect(out).toMatch(/<ol[^>]*><li>أول<\/li>/);
  });

  it('نص فارغ لا يرسم شيئًا', () => {
    expect(html('')).toBe('');
  });
});
