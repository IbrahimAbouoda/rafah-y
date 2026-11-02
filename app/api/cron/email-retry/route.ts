import { cronHandler } from '@/lib/cron';
import { db } from '@/lib/db';
import { retryPendingEmails } from '@/lib/notify';

// §8.3 — إعادة إرسال البريد المعلّق (PENDING) بعد ضبط الناقل. بنفس سرّ الجدولة (S5-1):
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/email-retry

export const dynamic = 'force-dynamic';

const handle = cronHandler('email-retry', () => retryPendingEmails(db));

export const GET = handle;
export const POST = handle;
