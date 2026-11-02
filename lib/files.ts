// فحص نوع الملف بمحتواه لا بامتداده — PRD §6.5. منطق خالص قابل للاختبار، يعمل على الخادم والعميل.

/** حاوية Supabase Storage الخاصة لمرفقات الشكاوى */
export const COMPLAINT_BUCKET = 'complaint-attachments';

// §6.5: القائمة البيضاء والحدود — هنا لا في lib/validation كي لا يحمل نموذج الشكوى مخططات zod إلى المتصفح
export const UPLOAD_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_RECORD = 5;

export type AllowedMime = (typeof UPLOAD_MIME_TYPES)[number];

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((byte, i) => b[offset + i] === byte);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** النوع الفعلي من «التوقيع» في أول البايتات، أو null إن لم يكن من القائمة البيضاء. */
export function sniffMime(bytes: Uint8Array): AllowedMime | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  if (startsWith(bytes, ascii('%PDF-'))) return 'application/pdf';
  return null;
}

const EXTENSIONS: Record<AllowedMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export const extensionFor = (mime: AllowedMime) => EXTENSIONS[mime];

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} ك.ب`;
  return `${(n / 1024 / 1024).toFixed(1)} م.ب`;
}
