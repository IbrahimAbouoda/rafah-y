import { Fragment, type ReactNode } from 'react';

// مُنقّي Markdown — PRD §6.3: «محتوى Markdown (إجابات FAQ، التقارير) يمرّ بمُنقٍّ يمنع الوسوم النشطة».
// لا يُحوَّل النص إلى HTML ولا يُستعمل dangerouslySetInnerHTML: يُبنى شجرة React من مجموعة فرعية آمنة،
// وكل ما سواها (وسوم HTML، سكربت، صور، جداول) يبقى نصًا ظاهرًا يهرّبه React.
// المدعوم: فقرات · سطر جديد · عناوين ### · قوائم - و 1. · **عريض** · *مائل* · [نص](رابط).
// الروابط: http و https و mailto والمسارات الداخلية /… فقط — javascript: و data: وغيرها تُعرض نصًا بلا رابط.

export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^\/(?!\/)/.test(h)) return h; // داخلي، لا //host
  if (/^mailto:[^\s]+$/i.test(h)) return h;
  try {
    const url = new URL(h);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

const INLINE = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1] !== undefined) out.push(<strong key={k}>{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<em key={k}>{m[2]}</em>);
    else {
      const href = safeHref(m[4]!);
      const external = href !== null && !href.startsWith('/');
      out.push(
        href ? (
          <a key={k} href={href} className="text-brand underline" {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}>
            {m[3]}
          </a>
        ) : (
          <Fragment key={k}>{m[3]}</Fragment>
        ),
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** سطور ضمن كتلة واحدة مع <br> بينها */
function lines(block: string[], key: string): ReactNode[] {
  return block.flatMap((l, i) => [...(i ? [<br key={`${key}-br${i}`} />] : []), ...inline(l, `${key}-${i}`)]);
}

export function Markdown({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const nodes: ReactNode[] = [];
  blocks.forEach((raw, b) => {
    const rows = raw.split('\n').filter((l) => l.trim() !== '');
    if (rows.length === 0) return;
    const key = `b${b}`;
    if (rows.every((l) => /^\s*[-*]\s+/.test(l))) {
      nodes.push(
        <ul key={key} className="list-disc ps-5">
          {rows.map((l, i) => (
            <li key={i}>{inline(l.replace(/^\s*[-*]\s+/, ''), `${key}-${i}`)}</li>
          ))}
        </ul>,
      );
    } else if (rows.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      nodes.push(
        <ol key={key} className="list-decimal ps-5">
          {rows.map((l, i) => (
            <li key={i}>{inline(l.replace(/^\s*\d+[.)]\s+/, ''), `${key}-${i}`)}</li>
          ))}
        </ol>,
      );
    } else if (rows.length === 1 && /^#{1,3}\s+/.test(rows[0]!)) {
      nodes.push(
        <p key={key} className="font-semibold">
          {inline(rows[0]!.replace(/^#{1,3}\s+/, ''), key)}
        </p>,
      );
    } else {
      nodes.push(<p key={key}>{lines(rows, key)}</p>);
    }
  });
  return <div className={className ?? 'flex flex-col gap-2 text-sm leading-7'}>{nodes}</div>;
}
