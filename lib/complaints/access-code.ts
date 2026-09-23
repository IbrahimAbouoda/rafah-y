// بلا 'server-only': تستخدمه البذرة (tsx) أيضًا. node:crypto لا يُحزَّم للمتصفح أصلًا.
import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// رمز المتابعة — PRD §5.1 خطوة 3 · §6.7: 8 خانات عشوائية تُعرض مرة واحدة، ولا يُخزَّن إلا تجزئتها.
// الأبجدية بلا محارف ملتبسة (0/O · 1/I/L) لأن الرمز يُكتب يدويًا على الجوّال.

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ACCESS_CODE_LENGTH = 8;

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 32;

export function generateAccessCode(): string {
  let code = '';
  for (let i = 0; i < ACCESS_CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** للعرض: ABCD-EFGH */
export const formatAccessCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

/** يقبل ما يكتبه المستخدم: أحرف صغيرة، شرطة، مسافات. */
export function normalizeAccessCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export async function hashAccessCode(code: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(normalizeAccessCode(code), salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** مقارنة بزمن ثابت (AC-02). تجزئة تالفة أو ناقصة = فشل، لا استثناء. */
export async function verifyAccessCode(code: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(normalizeAccessCode(code), Buffer.from(saltB64, 'base64'), KEY_LENGTH);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// تجزئة ثابتة لرمز لا يطابق أي شيء: يُتحقق منها حين لا يوجد الرقم المرجعي، فيتساوى زمن الاستجابة
// بين «رقم غير موجود» و«رمز خاطئ» ولا يكشف التوقيت وجود الشكوى.
let decoy: Promise<string> | null = null;
export async function verifyAgainstDecoy(code: string): Promise<false> {
  decoy ??= hashAccessCode(generateAccessCode());
  await verifyAccessCode(code, await decoy);
  return false;
}
