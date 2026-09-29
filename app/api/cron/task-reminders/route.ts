import { cronHandler } from '@/lib/cron';
import { sendDueSoonReminders } from '@/lib/tasks/reminders';

// S5-1 — تذكير «اقتراب موعد مهمة» المجدول. تستدعيه جدولة المنصة المضيفة (كل ساعة مثلًا)، ويُستدعى يدويًا في التطوير:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/task-reminders
// ليس صفحة ولا يُرى في التنقل.

export const dynamic = 'force-dynamic';

const handle = cronHandler('task-reminders', () => sendDueSoonReminders());

// GET لجدولات تستدعي بـ GET فقط (مثل Vercel Cron) · POST للاستدعاء اليدوي
export const GET = handle;
export const POST = handle;
