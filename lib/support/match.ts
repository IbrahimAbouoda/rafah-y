// بوت الاستفسارات — PRD §13.2: بحث في قاعدة FAQ المعتمدة، بلا ذكاء اصطناعي. منطق خالص يُختبر وحدةً.
// إما إجابة معتمدة من FaqEntry نشط، أو «لم أجد» — لا حالة ثالثة ولا نص مؤلَّف (§13.1).

const TASHKEEL = /[\u064B-\u065F\u0670\u0640]/g; // الحركات والتطويل
const PUNCT = /[^\u0621-\u064A\u0660-\u0669a-z0-9\s]/g; // كل ما ليس حرفًا عربيًا أو لاتينيًا أو رقمًا

/** التطبيع (§13.2): حذف التشكيل، أ إ آ ٱ ← ا، ة ← ه، ى ← ي، وتجاهل الترقيم */
export function normalizeArabic(text: string): string {
  return text
    .toLowerCase()
    .replace(TASHKEEL, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u064A')
    .replace(/[\u060C\u061B\u061F]/g, ' ')
    .replace(PUNCT, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** كلمات لا تميّز سؤالًا عن آخر (بعد التطبيع) */
const STOPWORDS = new Set(
  ['في', 'من', 'على', 'الى', 'عن', 'مع', 'او', 'ثم', 'هل', 'ما', 'ماذا', 'كيف', 'متى', 'اين', 'لماذا', 'هو', 'هي', 'ان', 'لا', 'نعم', 'انا', 'انت', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'كان', 'يمكن', 'اريد', 'ممكن', 'لو', 'عند', 'كل', 'اي', 'بعد', 'قبل', 'و'].map(
    normalizeArabic,
  ),
);

/** جذع خفيف: سوابق التعريف والعطف والجر الشائعة، فـ «للشكوى» و «الشكوى» و «شكوى» واحدة */
export function lightStem(token: string): string {
  // الأطول أولًا: حرف عطف + جر + تعريف ثم الأقصر
  for (const p of ['وبال', 'وكال', 'ولل', 'فبال', 'فلل', 'وال', 'فال', 'بال', 'كال', 'لل', 'ال']) {
    if (token.startsWith(p) && token.length - p.length >= 2) return token.slice(p.length);
  }
  if ((token.startsWith('و') || token.startsWith('ب')) && token.length >= 4) return token.slice(1);
  return token;
}

export function meaningfulTokens(text: string): string[] {
  return [...new Set(normalizeArabic(text).split(' ').filter((t) => t.length >= 2 && !STOPWORDS.has(t)).map(lightStem))];
}

export type FaqCandidate = { id: string; question: string; answerMd: string; keywords: string[]; useCount: number };
export type FaqMatch = FaqCandidate & { score: number };

/** الحد الأدنى للتشابه: دونه «لا إجابة» (§13.2) */
export const MIN_SCORE = 0.5;
export const MAX_RESULTS = 3;

const tokenIn = (t: string, pool: Set<string>) => {
  if (pool.has(t)) return true;
  // تطابق جزئي للكلمات الطويلة: «اقدم» ↔ «اقدمها»
  if (t.length >= 4) for (const p of pool) if (p.length >= 4 && (p.startsWith(t) || t.startsWith(p))) return true;
  return false;
};

/**
 * الترتيب (§13.2): تطابق كلمة مفتاحية كاملة أولًا، ثم تطابق في نص السؤال، ثم في نص الإجابة.
 * كلمة مفتاحية تطابق ⇒ الدرجة ≥ 1. بدونها أقصى الدرجة 1 من تغطية السؤال (0.8) والإجابة (0.2)،
 * فيلزم تغطية أغلب كلمات السؤال ليتجاوز الحد.
 */
export function matchFaq(query: string, entries: readonly FaqCandidate[]): FaqMatch[] {
  const tokens = meaningfulTokens(query);
  if (tokens.length === 0) return [];
  const normalizedQuery = ` ${normalizeArabic(query).split(' ').map(lightStem).join(' ')} `;

  const scored = entries.map((e) => {
    const kwHits = e.keywords.filter((k) => {
      const nk = normalizeArabic(k).split(' ').map(lightStem).join(' ');
      return nk.length >= 2 && normalizedQuery.includes(` ${nk} `);
    }).length;
    const qPool = new Set(meaningfulTokens(e.question));
    const aPool = new Set(meaningfulTokens(e.answerMd));
    const qCov = tokens.filter((t) => tokenIn(t, qPool)).length / tokens.length;
    const aCov = tokens.filter((t) => tokenIn(t, aPool)).length / tokens.length;
    const score = kwHits > 0 ? 1 + 0.1 * (kwHits - 1) + 0.5 * qCov : 0.8 * qCov + 0.2 * aCov;
    return { ...e, score };
  });

  return scored
    .filter((m) => m.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || b.useCount - a.useCount)
    .slice(0, MAX_RESULTS);
}
