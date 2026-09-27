import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { COUNCIL_EMAIL, COUNCIL_SENDER_NAME } from '@/lib/config';
import { logError } from '@/lib/log';

// البريد الصادر — PRD §8.1 · D19. المرسِل دائمًا بريد المجلس الرسمي.
// الإنتاج: SMTP الخاص بـ Gmail بكلمة مرور تطبيق. التطوير: Mailpit المحلي من Supabase (بلا مصادقة).
// SMTP_HOST فارغ ⇒ لا إرسال، ويبقى الإشعار PENDING ليُرسل لاحقًا — ولا يتعطل أي إجراء بسبب البريد (§8.3).

export type MailMessage = { to: string; subject: string; text: string; html: string };

const globalForMail = globalThis as unknown as { mailTransport?: Transporter | null };

function transport(): Transporter | null {
  if (globalForMail.mailTransport !== undefined) return globalForMail.mailTransport;
  const { SMTP_HOST: host, SMTP_PORT: port, SMTP_USER: user, SMTP_PASS: pass } = process.env;
  globalForMail.mailTransport = host
    ? nodemailer.createTransport({
        host,
        port: Number(port ?? 587),
        secure: Number(port) === 465,
        auth: user && pass ? { user, pass } : undefined,
      })
    : null;
  return globalForMail.mailTransport;
}

export const mailConfigured = () => transport() !== null;

/** يرسل رسالة واحدة. لا يرمي أبدًا: النتيجة true/false. */
export async function sendMail(message: MailMessage): Promise<boolean> {
  const t = transport();
  if (!t) return false;
  try {
    await t.sendMail({
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
<h2 style="color:#0b5c4b;font-size:18px">${escapeHtml(opts.title)}</h2>
${opts.lines.map((l) => `<p style="margin:0 0 8px">${escapeHtml(l)}</p>`).join('\n')}
${opts.link ? `<p><a href="${escapeHtml(opts.link.href)}" style="color:#0b5c4b">${escapeHtml(opts.link.label)}</a></p>` : ''}
<p style="color:#666;font-size:12px;margin-top:24px">${escapeHtml(COUNCIL_SENDER_NAME)} · ${COUNCIL_EMAIL}</p>
</body></html>`;
  return { text, html };
}
