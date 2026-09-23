import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// تشفير بيانات التواصل — PRD §6.6: AES-256-GCM بمفتاح خارج قاعدة البيانات.
// الصيغة: [إصدار المفتاح 1 بايت][IV 12][TAG 16][النص المشفّر] — الإصدار يسمح بتدوير المفتاح لاحقًا.
const KEY_VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function loadKey(raw = process.env.CONTACT_ENCRYPTION_KEY): Buffer {
  if (!raw) throw new Error('CONTACT_ENCRYPTION_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('CONTACT_ENCRYPTION_KEY must be 32 bytes (base64)');
  return key;
}

export function encryptField(plain: string, rawKey?: string): Uint8Array<ArrayBuffer> {
  const key = loadKey(rawKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const out = Buffer.concat([Buffer.from([KEY_VERSION]), iv, cipher.getAuthTag(), body]);
  return new Uint8Array(out);
}

export function decryptField(data: Uint8Array, rawKey?: string): string {
  const buf = Buffer.from(data);
  if (buf[0] !== KEY_VERSION) throw new Error(`Unknown contact key version ${buf[0]}`);
  const iv = buf.subarray(1, 1 + IV_LENGTH);
  const tag = buf.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
  const body = buf.subarray(1 + IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', loadKey(rawKey), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
