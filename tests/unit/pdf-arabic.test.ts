import { describe, expect, it } from 'vitest';
import { hasArabic, pdfInlines, pdfLines, shapeArabic, toVisual, wrapLogical } from '@/lib/pdf/arabic';

// S5-2 — نص عربي لـ pdfmake: التشكيل، الترتيب البصري، والقطع التي تعوّض قلب fontkit.
// (التحقق من مواضع الحروف في PDF فعلي جرى بـ pdfium أثناء التطوير؛ هنا المنطق الخالص.)

const cps = (s: string) => [...s].map((c) => c.codePointAt(0)!.toString(16));
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, '·');

describe('shapeArabic', () => {
  it('أشكال سياقية وتركيب «لا»', () => {
    expect(cps(shapeArabic('لا'))).toEqual(['fefb']);
    // باء أولى + هاء نهائية
    expect(cps(shapeArabic('به'))).toEqual(['fe91', 'feea']);
  });

  it('يحذف الحركات (علامة مركّبة بعد القلب تقع على الحرف الخطأ)', () => {
    expect(shapeArabic('مُقدَّمة')).toBe(shapeArabic('مقدمة'));
  });

  it('لا يمسّ اللاتيني والأرقام', () => {
    expect(shapeArabic('M4 60%')).toBe('M4 60%');
  });
});

describe('toVisual — اتجاه أساسي RTL', () => {
  it('الكلمات العربية تنقلب، والرموز اللاتينية تبقى من اليسار لليمين، والأقواس تنعكس', () => {
    const v = toVisual(shapeArabic('الإغلاق (M4) بلغت'));
    expect(ascii(v)).toBe('···· (M4) ·····');
    // أول حرف بصري (أقصى اليسار) هو آخر حرف منطقي في «بلغت»
    expect(v[0]).toBe(shapeArabic('بلغت').at(-1));
  });

  it('رمز لاتيني واحد يبقى كما هو، ورمزان يُرتَّبان من اليمين كما في صفحة RTL', () => {
    expect(toVisual('2026-09')).toBe('2026-09');
    expect(toVisual('2026-09 M4')).toBe('M4 2026-09');
  });
});

describe('pdfInlines — تعويض قلب fontkit', () => {
  it('الكلمة العربية تُسلَّم مقلوبة، والمسافة قطعة منفصلة، واللاتيني كما هو', () => {
    const visual = toVisual(shapeArabic('نسبة M4'));
    const parts = pdfInlines(visual);
    expect(parts).toHaveLength(3);
    expect(parts[1]).toBe(' ');
    expect(parts[0]).toBe('M4');
    expect(parts[2]).toBe(shapeArabic('نسبة'));
    expect(parts.some((p) => p.length > 1 && p.includes(' '))).toBe(false);
  });
});

describe('wrapLogical', () => {
  const byChars = (s: string) => [...s].length;

  it('يلتف بالترتيب المنطقي فيبدأ السطر الأول بأول الجملة', () => {
    const lines = wrapLogical('واحد اثنان ثلاثة أربعة خمسة', 12, byChars);
    expect(lines[0]).toBe('واحد اثنان');
    expect(lines.join(' ')).toBe('واحد اثنان ثلاثة أربعة خمسة');
    for (const l of lines) expect(byChars(shapeArabic(l)) <= 12 || !l.includes(' ')).toBe(true);
  });

  it('يحفظ الفقرات، والكلمة الأطول من السطر تبقى وحدها', () => {
    expect(wrapLogical('أ\nب', 100, byChars)).toEqual(['أ', 'ب']);
    expect(wrapLogical('قصيرة استثنائيةالطولجدا', 5, byChars)).toEqual(['قصيرة', 'استثنائيةالطولجدا']);
  });

  it('pdfLines: سطر لكل عنصر، وكل سطر قطع', () => {
    const lines = pdfLines('واحد اثنان ثلاثة', 11, byChars);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => Array.isArray(l) && l.every((p) => typeof p === 'string'))).toBe(true);
    expect(hasArabic(lines[0]!.join(''))).toBe(true);
  });
});
