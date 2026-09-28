// ملف مُولَّد على الخادم يُسلَّم للمتصفح مباشرة (base64 في نتيجة Server Action) — لا يُحفظ ملف دائم (المحور ٣).

export type DownloadFile = { filename: string; mimeType: string; base64: string };

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const PDF_MIME = 'application/pdf';

/** سقف الصفوف في ملف واحد: ما فوقه يحتاج تصفية (والنتيجة تمر عبر الذاكرة كاملة) */
export const MAX_EXPORT_ROWS = 10_000;

export const toDownload = (buffer: Buffer | Uint8Array, filename: string, mimeType: string): DownloadFile => ({
  filename,
  mimeType,
  base64: Buffer.from(buffer).toString('base64'),
});

/** تاريخ اليوم YYYY-MM-DD بتوقيت غزة لأسماء الملفات */
export const fileDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza' }).format(d);
