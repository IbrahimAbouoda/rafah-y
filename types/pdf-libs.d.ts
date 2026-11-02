// تعريفات دنيا لمكتبات التصدير بلا أنواع منشورة (S5-2) — ما نستخدمه منها فقط.

declare module 'arabic-persian-reshaper' {
  type Shaper = { convertArabic(text: string): string };
  const reshaper: { ArabicShaper: Shaper; PersianShaper: Shaper };
  export default reshaper;
}

declare module 'bidi-js' {
  type EmbeddingLevels = { levels: Uint8Array; paragraphs: { start: number; end: number; level: number }[] };
  type Bidi = {
    getEmbeddingLevels(text: string, direction?: 'ltr' | 'rtl'): EmbeddingLevels;
    getReorderSegments(text: string, levels: EmbeddingLevels, start?: number, end?: number): [number, number][];
    getMirroredCharactersMap(text: string, levels: Uint8Array, start?: number, end?: number): Map<number, string>;
  };
  export default function bidiFactory(): Bidi;
}

declare module 'fontkit' {
  export type Font = {
    unitsPerEm: number;
    hasGlyphForCodePoint(codePoint: number): boolean;
    layout(text: string): { advanceWidth: number };
  };
  export function create(buffer: Buffer): Font;
}

declare module 'pdfmake' {
  // هيكل المستند مفتوح بطبيعته في pdfmake (عقد نصوص وجداول وأنماط متداخلة)
  export type Content = Record<string, unknown> | string | Content[];
  export type DocDefinition = Record<string, unknown> & { content: Content };
  type FontFaces = { normal: string; bold: string; italics: string; bolditalics: string };
  const pdfmake: {
    virtualfs: { writeFileSync(name: string, data: Buffer): void };
    addFonts(fonts: Record<string, FontFaces>): void;
    setUrlAccessPolicy(cb: (url: string) => boolean): void;
    setLocalAccessPolicy(cb: (path: string) => boolean): void;
    createPdf(doc: DocDefinition): { getBuffer(): Promise<Buffer> };
  };
  export default pdfmake;
}
