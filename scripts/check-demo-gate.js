// بوابة بيانات العرض — AC-20 · M10 · PRD C5: بناء الإنتاج يفشل إن وُجدت بيانات عرض.
// تعمل تلقائيًا قبل `npm run build` (prebuild)، وتُستدعى في CI قبل النشر:
//
//   node scripts/check-demo-gate.js
//
// «الإنتاج» = APP_ENV=production (أو VERCEL_ENV=production). خارجه لا تفحص شيئًا، فبناء E2E المحلي
// (APP_ENV=staging) والتطوير يمرّان. في الإنتاج يفشل البناء إن:
//   ① كان NEXT_PUBLIC_IS_DEMO=true أو IS_DEMO=true
//   ② وُجد سجل isDemo = true (ومنه المحذوف ناعمًا) في أي من النماذج الستة
//   ③ تعذّر التحقق من القاعدة — البوابة تُغلق عند الشك ولا تمرّر.
import { pathToFileURL } from 'node:url';

export const DEMO_TABLES = ['complaints', 'ideas', 'initiatives', 'organizations', 'opportunities', 'activities'];

export const DEMO_COUNT_SQL = DEMO_TABLES.map(
  (t) => `SELECT '${t}' AS "table", count(*)::int AS "count" FROM "${t}" WHERE "isDemo" = true`,
).join(' UNION ALL ');

const DEMO_FLAGS = ['NEXT_PUBLIC_IS_DEMO', 'IS_DEMO'];

export const isProduction = (env) => env.APP_ENV === 'production' || env.VERCEL_ENV === 'production';

/**
 * @param {Record<string, string | undefined>} env
 * @param {(url: string) => Promise<{ table: string; count: number }[]>} countDemo
 * @returns {Promise<{ ok: boolean; message: string }>}
 */
export async function checkDemoGate(env, countDemo) {
  if (!isProduction(env)) {
    return { ok: true, message: 'بوابة بيانات العرض: ليست بيئة إنتاج (APP_ENV) — لا فحص.' };
  }

  const flags = DEMO_FLAGS.filter((k) => env[k] === 'true');
  if (flags.length > 0) {
    return {
      ok: false,
      message: `بوابة بيانات العرض: ${flags.join(' و ')}=true في بيئة الإنتاج. احذف المتغيّر أو اجعله false ثم أعد البناء.`,
    };
  }

  const url = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!url) {
    return {
      ok: false,
      message: 'بوابة بيانات العرض: لا DIRECT_URL ولا DATABASE_URL في بيئة الإنتاج، فلا يمكن التحقق من خلوّ القاعدة من بيانات العرض.',
    };
  }

  let rows;
  try {
    rows = await countDemo(url);
  } catch (e) {
    return {
      ok: false,
      message: `بوابة بيانات العرض: تعذّر الاتصال بقاعدة الإنتاج للتحقق (${e instanceof Error ? e.message : String(e)}). تحقّق من رابط القاعدة ثم أعد البناء.`,
    };
  }

  const found = rows.filter((r) => Number(r.count) > 0);
  if (found.length > 0) {
    const list = found.map((r) => `${r.table}: ${r.count}`).join(' · ');
    return {
      ok: false,
      message: `بوابة بيانات العرض: في قاعدة الإنتاج سجلات isDemo = true (${list}). شغّل npm run admin:purge-demo على قاعدة الإنتاج ثم أعد البناء.`,
    };
  }
  return { ok: true, message: 'بوابة بيانات العرض: قاعدة الإنتاج خالية من بيانات العرض.' };
}

async function countWithPg(url) {
  const { default: pg } = await import('pg');
  const { pgConnection } = await import('../lib/pg-ssl.js');
  // مهلتان: تعلّق الشبكة يُفشل البناء برسالة واضحة بدل انتظار مهلة Vercel
  const client = new pg.Client({ ...pgConnection(url), connectionTimeoutMillis: 10_000, query_timeout: 15_000 });
  await client.connect();
  try {
    return (await client.query(DEMO_COUNT_SQL)).rows;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // نفس ملفات .env.production* التي يقرؤها next build، ومتغيّرات CI الصريحة تتقدّم عليها
  const { default: nextEnv } = await import('@next/env');
  nextEnv.loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });

  const result = await checkDemoGate(process.env, countWithPg);
  if (result.ok) {
    console.log(result.message);
  } else {
    console.error(result.message);
    process.exit(1);
  }
}
