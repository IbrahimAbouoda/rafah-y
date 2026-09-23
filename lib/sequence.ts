import 'server-only';
import type { Tx } from '@/lib/db';

// الأرقام المرجعية — PRD §4.3. لا يُولَّد رقم مرجعي خارج هذه الدالة.
const WIDTH = { CMP: 6, IDA: 6, DEC: 4 } as const;
export type RefKind = keyof typeof WIDTH;

/** السنة بتوقيت غزة، فالشكوى المقدّمة ليلة رأس السنة تحمل سنة تقديمها المحلية. */
export function localYear(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Gaza' }).format(now));
}

/** يُستدعى داخل المعاملة نفسها التي تنشئ السجل. */
export async function nextRef(tx: Tx, kind: RefKind, now = new Date()): Promise<string> {
  const key = `${kind}-${localYear(now)}`;
  const rows = await tx.$queryRaw<{ ref: string }[]>`SELECT next_ref(${key}, ${WIDTH[kind]}::int) AS ref`;
  const ref = rows[0]?.ref;
  if (!ref) throw new Error(`next_ref returned no value for ${key}`);
  return ref;
}
