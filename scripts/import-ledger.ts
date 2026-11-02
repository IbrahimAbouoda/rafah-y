// إدخال سجل مقبوضات ومصروفات 2026 في funding_records — مرة واحدة على قاعدة الإنتاج.
//
//   npm run finance:import -- <file.md> --recorder <email-or-phone> [--org "اسم في الملف=اسم المؤسسة في المنصة"]...
//       تجربة بلا كتابة: تطبع ما سيُدخل وتتوقف.
//   ... --apply --confirm-host <host>
//       الكتابة الفعلية: NODE_ENV=production فقط (لا بيانات حقيقية في التطوير)، و <host> يطابق قاعدة البيانات المستهدفة.
//   ... --accept-computed-totals
//       يتوقف السكربت إن خالف ملخص الملف مجموع بنوده؛ هذا الخيار يعتمد مجموع البنود بعد مراجعة الفرق.
//
// كل القيود تدخل معلّقة باسم أمين الصندوق، ويعتمدها الرئيس من /admin/finance. إعادة التشغيل آمنة.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { parseLedger, planLedgerImport, writeLedgerEntries, type ImportRow } from '../lib/finance/ledger-import';

// تصنيف بنود سجل 2026 برقم الصف (لا عمود بند في الملف) — راجعه المالك في التقرير المالي
const CATEGORIES_2026: Record<string, number[]> = {
  الاتصالات: [27],
  'المواصلات والزيارات': [2, 3, 6, 8, 9, 10, 11, 12, 13, 14, 15, 17, 19, 24, 25, 30, 31, 33, 34, 37, 38],
  'الضيافة والوجبات': [1, 4, 7, 20, 22, 26, 32, 36, 40],
  'الطباعة والدعم اللوجستي': [35, 39],
  المكافآت: [16, 23],
  التأجير: [5, 21],
  'المصاريف والنفقات التشغيلية': [18, 28, 29],
};
const categoryByRow = new Map(Object.entries(CATEGORIES_2026).flatMap(([name, rows]) => rows.map((n) => [n, name] as const)));

function readArgs(argv: string[]) {
  const args = { file: '', recorder: '', apply: false, acceptTotals: false, confirmHost: '', orgs: new Map<string, string>() };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--apply') args.apply = true;
    else if (arg === '--accept-computed-totals') args.acceptTotals = true;
    else if (arg === '--recorder') args.recorder = argv[++i] ?? '';
    else if (arg === '--confirm-host') args.confirmHost = argv[++i] ?? '';
    else if (arg === '--org') {
      const [from, to] = (argv[++i] ?? '').split('=');
      if (!from?.trim() || !to?.trim()) throw new Error('--org يأخذ "الاسم في الملف=اسم المؤسسة في المنصة".');
      args.orgs.set(from.trim(), to.trim());
    } else if (arg.startsWith('--')) throw new Error(`خيار غير معروف: ${arg}`);
    else args.file = arg;
  }
  if (!args.file || !args.recorder) throw new Error('الاستخدام: npm run finance:import -- <file.md> --recorder <email-or-phone> [--org "من=إلى"] [--accept-computed-totals] [--apply --confirm-host <host>]');
  return args;
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const ledger = parseLedger(readFileSync(args.file, 'utf8'));
  console.log(`الملف: ${ledger.entries.filter((e) => e.direction === 'INCOMING').length} وارد · ${ledger.entries.filter((e) => e.direction === 'OUTGOING').length} مصروف`);
  console.log(`مجموع البنود: الوارد ${ledger.computed.incoming.ILS} ILS و ${ledger.computed.incoming.USD} USD · المصروفات ${ledger.computed.outgoing.ILS} ILS و ${ledger.computed.outgoing.USD} USD`);

  const missing = ledger.entries.filter((e) => e.direction === 'OUTGOING' && !categoryByRow.has(e.n));
  if (missing.length) throw new Error(`صفوف مصروفات بلا بند في CATEGORIES_2026: ${missing.map((e) => e.n).join('، ')}. هذا التصنيف لسجل 2026 تحديدًا.`);

  if (ledger.mismatches.length) {
    console.log('\nملخص الملف يخالف مجموع بنوده:');
    for (const m of ledger.mismatches) console.log(`  • ${m}`);
    if (!args.acceptTotals) throw new Error('توقفت. صحّح الملف، أو أعد التشغيل بـ --accept-computed-totals لاعتماد مجموع البنود.');
    console.log('  اعتُمد مجموع البنود (--accept-computed-totals).');
  }

  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Set DIRECT_URL (or DATABASE_URL)');
  const host = new URL(url).hostname;
  console.log(`\nقاعدة البيانات المستهدفة: ${host}`);

  if (args.apply) {
    if (process.env.NODE_ENV !== 'production') throw new Error('الكتابة تعمل بـ NODE_ENV=production فقط: لا بيانات حقيقية في بيئة التطوير.');
    if (args.confirmHost !== host) throw new Error(`--confirm-host يجب أن يطابق ${host}. تأكد أن هذه هي القاعدة المقصودة.`);
  }

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const recorder = await db.user.findFirst({
      where: { OR: [{ email: args.recorder.toLowerCase() }, { phone: args.recorder }], deletedAt: null, isActive: true },
      select: { id: true, fullName: true },
    });
    if (!recorder) throw new Error(`لا مستخدم نشط بهذا المعرّف: ${args.recorder}.`);
    const now = new Date();
    const canRecord = await db.roleAssignment.count({
      where: {
        userId: recorder.id,
        revokedAt: null,
        startsAt: { lte: now },
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, { OR: [{ role: { isTermBound: false } }, { term: { isCurrent: true } }] }],
        role: { permissions: { some: { permission: { key: 'finance:record' } } } },
      },
    });
    if (canRecord === 0) throw new Error(`${recorder.fullName} لا يملك finance:record. القيود تُسجَّل باسم أمين الصندوق.`);
    console.log(`المسجِّل: ${recorder.fullName}`);

    const organizations = await db.organization.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
    const idByName = new Map(organizations.map((o) => [o.name, o.id]));
    for (const target of args.orgs.values()) {
      if (!idByName.has(target)) throw new Error(`لا مؤسسة باسم «${target}» في المنصة. أنشئها من /admin/organizations أولًا.`);
    }

    const rows: ImportRow[] = ledger.entries.map((entry) => ({
      ...entry,
      organizationId: entry.direction === 'INCOMING' && entry.party ? (idByName.get(args.orgs.get(entry.party) ?? entry.party) ?? null) : null,
      category: entry.direction === 'OUTGOING' ? categoryByRow.get(entry.n)! : null,
    }));

    console.log('\nمصادر الوارد:');
    for (const row of rows.filter((r) => r.direction === 'INCOMING')) {
      console.log(`  • ${row.party ?? '—'}: ${row.organizationId ? 'مرتبط بمؤسسة (يظهر اسمها للعامة بعد الاعتماد)' : 'نص حر (لا يظهر اسمه للعامة)'}`);
    }

    const existing = await db.fundingRecord.findMany({
      select: { direction: true, occurredAt: true, amount: true, currency: true, description: true, counterparty: true, organizationId: true },
    });
    const organizationNames = new Map(organizations.map((o) => [o.id, o.name]));
    const { toCreate, skipped } = planLedgerImport(rows, existing, organizationNames);
    console.log(`\nسيُدخل: ${toCreate.length} قيدًا معلّقًا · موجود مسبقًا: ${skipped.length}`);

    if (!args.apply) {
      console.log('تجربة فقط: لم يُكتب شيء. أضف --apply --confirm-host للكتابة.');
      return;
    }
    await db.$transaction((tx) => writeLedgerEntries(tx, toCreate, recorder.id));
    console.log(`✓ أُدخل ${toCreate.length} قيدًا. يعتمدها الرئيس من /admin/finance، وتظهر للعامة بعد ذلك.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
