import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { COUNCIL_EMAIL, COUNCIL_SENDER_NAME } from '@/lib/config';
import { logError } from '@/lib/log';

// البريد الصادر — PRD §8.1 · D19. المرسِل دائمًا بريد المجلس الرسمي.
// الإنتاج: SMTP الخاص بـ Gmail بكلمة مرور تطبيق. التطوير: Mailpit المحلي من Supabase (بلا مصادقة).
// SMTP_HOST فارغ ⇒ لا إرسال، ويبقى الإشعار PENDING ليُرسل لاحقًا — ولا يتعطل أي إجراء بسبب البريد (§8.3).

export type MailMessage = { to: string; subject: string; text: string; html: string };

/**
 * الناقل (adapter): smtp حين يُضبط SMTP_HOST، أو memory حين MAIL_TRANSPORT=memory (للاختبارات والتطوير بلا Mailpit):
 * يلتقط الرسائل في صندوق داخل العملية ولا يرسل شيئًا. memory ممنوع في الإنتاج — يُعامَل كغير مضبوط.
 */
type Adapter = { kind: 'smtp'; transporter: Transporter } | { kind: 'memory' };

const globalForMail = globalThis as unknown as { mailAdapter?: Adapter | null; mailOutbox?: MailMessage[] };

function adapter(): Adapter | null {
  if (globalForMail.mailAdapter !== undefined) return globalForMail.mailAdapter;
  const { SMTP_HOST: host, SMTP_PORT: port, SMTP_USER: user, SMTP_PASS: pass, MAIL_TRANSPORT: kind, NODE_ENV } = process.env;
  if (kind === 'memory' && NODE_ENV !== 'production') {
    globalForMail.mailAdapter = { kind: 'memory' };
  } else {
    globalForMail.mailAdapter = host
      ? {
          kind: 'smtp',
          transporter: nodemailer.createTransport({
            host,
            port: Number(port ?? 587),
            secure: Number(port) === 465,
            auth: user && pass ? { user, pass } : undefined,
          }),
        }
      : null;
  }
  return globalForMail.mailAdapter;
}

export const mailConfigured = () => adapter() !== null;

/** صندوق الناقل memory — ما «أُرسل» في هذه العملية (للاختبارات) */
export function mailOutbox(): MailMessage[] {
  return (globalForMail.mailOutbox ??= []);
}

/** يعيد قراءة الإعداد من البيئة في الطلب التالي (للاختبارات التي تبدّل الناقل) */
export function resetMailAdapter() {
  globalForMail.mailAdapter = undefined;
}

/** يرسل رسالة واحدة. لا يرمي أبدًا: النتيجة true/false. */
export async function sendMail(message: MailMessage): Promise<boolean> {
  const a = adapter();
  if (!a) return false;
  if (a.kind === 'memory') {
    mailOutbox().push(message);
    return true;
  }
  try {
    await a.transporter.sendMail({
      from: { name: COUNCIL_SENDER_NAME, address: COUNCIL_EMAIL },
      replyTo: COUNCIL_EMAIL,
      ...message,
    });
    return true;
  } catch (e) {
    logError('mail', e);
    return false;
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** قالب عربي RTL بسيط، نصي أساسًا (§8.1). النص يُهرَّب — لا HTML من المدخلات. */
export function renderMail(opts: { title: string; lines: string[]; link?: { href: string; label: string } }): {
  text: string;
  html: string;
} {
  const text = [opts.title, '', ...opts.lines, ...(opts.link ? ['', `${opts.link.label}: ${opts.link.href}`] : []), '', COUNCIL_SENDER_NAME].join(
    '\n',
  );
  const html = `<!doctype html><html lang="ar" dir="rtl"><body style="font-family:Tahoma,Arial,sans-serif;line-height:1.7;color:#1a1a1a;direction:rtl;text-align:right">
<h2 style="color:#0b568f;font-size:18px">${escapeHtml(opts.title)}</h2>
${opts.lines.map((l) => `<p style="margin:0 0 8px">${escapeHtml(l)}</p>`).join('\n')}
${opts.link ? `<p><a href="${escapeHtml(opts.link.href)}" style="color:#0b568f">${escapeHtml(opts.link.label)}</a></p>` : ''}
<p style="color:#666;font-size:12px;margin-top:24px">${escapeHtml(COUNCIL_SENDER_NAME)} · ${COUNCIL_EMAIL}</p>
</body></html>`;
  return { text, html };
}
