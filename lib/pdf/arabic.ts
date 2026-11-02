import reshaper from 'arabic-persian-reshaper';
import bidiFactory from 'bidi-js';

// نص عربي لـ pdfmake (S5-2). pdfmake لا يعرف RTL: يلتف السطر ويصفّ الكلمات يسارًا ← يمينًا بترتيبها،
// و fontkit يقلب حروف كل كلمة عربية وحدها. فيُجهَّز كل سطر هنا:
//   1) الالتفاف بالترتيب المنطقي وبقياس الخط نفسه — التفاف pdfmake لسطر معكوس يقدّم آخر الجملة
//   2) التشكيل (arabic-persian-reshaper): أشكال الحروف السياقية وتركيب «لا»
//   3) الترتيب البصري (bidi-js): اتجاه أساسي RTL، الأرقام واللاتيني تبقى LTR، والأقواس معكوسة
//   4) قطع منفصلة للكلمات والمسافات، والعربية منها مقلوبة لأن fontkit سيقلبها مرة أخرى عند الرسم
// التحقق كان على مواضع الحروف في الـ PDF الناتج (pdfium) لا على قراءة صورته.

const bidi = bidiFactory();

/** الحركات تُحذف: علامة مركّبة بعد القلب تقع على الحرف الخطأ */
const HARAKAT = /[\u064B-\u065F\u0670]/g;
/** ما يجعل fontkit يعدّ الكلمة عربية فيقلبها (الحروف وأشكال العرض) */
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

export const hasArabic = (s: string) => ARABIC_SCRIPT.test(s);

export function shapeArabic(text: string): string {
  return reshaper.ArabicShaper.convertArabic(text.replace(HARAKAT, ''));
}

/** سطر مُشكَّل بترتيب منطقي ← ترتيب بصري يسار ← يمين (UAX #9، اتجاه أساسي RTL) */
export function toVisual(line: string): string {
  const levels = bidi.getEmbeddingLevels(line, 'rtl');
  const chars = line.split('');
  // يأخذ مصفوفة المستويات لا كائن النتيجة (خلافًا لمثال README)
  for (const [i, c] of bidi.getMirroredCharactersMap(line, levels.levels)) chars[i] = c;
  for (const [start, end] of bidi.getReorderSegments(line, levels)) {
    const flipped = chars.slice(start, end + 1).reverse();
    chars.splice(start, flipped.length, ...flipped);
  }
  return chars.join('');
}

/**
 * سطر بصري ← قطع pdfmake: كل كلمة قطعة وحدها والمسافة قطعة وحدها.
 * pdfkit يرسم الكلمة مع مسافتها اللاحقة في دفعة واحدة، فيقلب fontkit المسافة معها إلى الجهة الأخرى
 * وتلتصق الكلمات؛ القطع المنفصلة تُبقي كل فجوة مسافة واحدة. والكلمة العربية تُسلَّم مقلوبة
 * لأن fontkit يقلبها عند الرسم، فتُرسم بترتيبها البصري.
 */
export function pdfInlines(visual: string): string[] {
  const out: string[] = [];
  for (const w of visual.split(' ')) {
    if (out.length > 0) out.push(' ');
    if (w) out.push(hasArabic(w) ? w.split('').reverse().join('') : w);
  }
  return out;
}

/**
 * التفاف بالترتيب المنطقي: كل سطر لا يتجاوز maxWidth بقياس measure للنص المُشكَّل.
 * الكلمة الأطول من السطر تبقى وحدها في سطرها (لا تُكسر الكلمة العربية).
 */
export function wrapLogical(text: string, maxWidth: number, measure: (shaped: string) => number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (line && measure(shapeArabic(candidate)) > maxWidth) {
        out.push(line);
        line = w;
      } else {
        line = candidate;
      }
    }
    out.push(line);
  }
  return out;
}

/** نص منطقي ← أسطر، كل سطر قطع pdfmake جاهزة (سطر لكل عنصر في stack، محاذاة يمين) */
export function pdfLines(text: string, maxWidth: number, measure: (shaped: string) => number): string[][] {
  return wrapLogical(text, maxWidth, measure).map((l) => pdfInlines(toVisual(shapeArabic(l))));
}
