// حذف بيانات العرض قبل الإطلاق — AC-20 · Sprint 6. التشغيل المعتمد لهذا الأمر (لا صفحة له في PRD §11.2).
//
//   npm run admin:purge-demo -- <email-or-phone> "احذف البيانات التجريبية"
//
// <email-or-phone>: حساب المنفّذ، ويجب أن يملك settings:manage (المدير التقني) — يُسجَّل باسمه في AuditLog.
// العبارة الثانية تأكيد صريح يُكتب حرفيًا. بدونها يعرض الأمر ما سيُحذف ولا يحذف شيئًا.
// يحذف سجلات isDemo في النماذج الستة وما لا يوجد إلا بها، وحساب العرض DEMO_ACCOUNT_EMAIL، في معاملة واحدة
// بسطر settings.change. إعادة التشغيل آمنة: بلا بيانات عرض لا يحذف ولا يكتب شيئًا.
//
// يعمل بشرط react-server (انظر package.json) فتُحمَّل وحدات lib/* المحروسة بـ server-only كما في الخادم.
import 'dotenv/config';
import { createDb } from '../lib/db';
import { demoSnapshot, runDemoPurge } from '../lib/demo-data';
import { AppError } from '../lib/errors';
import { can } from '../lib/rbac';
import { loadSessionUser } from '../lib/session';
import { DEMO_PURGE_CONFIRMATION, PurgeDemoSchema } from '../lib/validation/settings';

async function main() {
  const [identifier, confirm] = process.argv.slice(2);
  if (!identifier) {
    console.error(`الاستخدام: npm run admin:purge-demo -- <email-or-phone> "${DEMO_PURGE_CONFIRMATION}"`);
    process.exit(2);
  }
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Set DIRECT_URL (or DATABASE_URL)');
  const db = createDb(url);

  try {
    const operator = await db.user.findFirst({
      where: { OR: [{ email: identifier.toLowerCase() }, { phone: identifier }], isActive: true },
      select: { id: true },
    });
    const actor = operator ? await loadSessionUser(db, operator.id) : null;
    if (!actor) throw new Error(`لا حساب فعّال بهذا المعرّف: ${identifier}.`);
    if (!can(actor, 'settings:manage')) {
      throw new Error(`${identifier} لا يملك settings:manage. هذا الأمر للمدير التقني وحده.`);
    }

    const snapshot = await demoSnapshot(db);
    console.log('بيانات العرض في القاعدة:', snapshot);

    if (!PurgeDemoSchema.safeParse({ confirm }).success) {
      console.log(`لم يُحذف شيء. للحذف أعد التشغيل مع عبارة التأكيد حرفيًا: "${DEMO_PURGE_CONFIRMATION}"`);
      process.exit(2);
    }

    const total = await runDemoPurge(db, actor, { source: 'cli' });
    console.log(
      total === 0
        ? 'لا بيانات تجريبية في القاعدة — لم يُحذف شيء.'
        : `حُذف ${total} سجلًا تجريبيًا وكل ما ارتبط بها، وسُجّلت العملية (settings.change) في سجل التدقيق.`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof AppError || e instanceof Error ? e.message : e);
  process.exit(1);
});
