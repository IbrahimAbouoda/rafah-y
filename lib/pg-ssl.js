// TLS لاتصالات PostgreSQL مع التحقق من شهادة الخادم — يستعمله lib/db.ts و scripts/check-demo-gate.js.
// JS خالص (لا server-only) لأن البوابة تعمل بـ node مباشرة قبل البناء.
//
// DATABASE_CA_CERT = نص شهادة Supabase الجذرية (Dashboard → Database → SSL Configuration)، وهي علنية لا سرّية.
// عند ضبطه: التحقق كامل (rejectUnauthorized)، وتُحذف معاملات ssl* من الرابط لأن pg يقدّم ما في الرابط
// على كائن ssl (connection-parameters.js)، فيُلغى التحقق بصمت لو بقي `uselibpqcompat=true&sslmode=require`.
// بدونه: الرابط كما هو (محليًا بلا TLS).

const SSL_PARAMS = ['sslmode', 'uselibpqcompat', 'sslrootcert', 'sslcert', 'sslkey'];

/**
 * @param {string} url
 * @param {Record<string, string | undefined>} env
 * @returns {{ connectionString: string; ssl?: { ca: string; rejectUnauthorized: true } }}
 */
export function pgConnection(url, env = process.env) {
  const ca = env.DATABASE_CA_CERT?.replace(/\\n/g, '\n').trim();
  if (!ca) return { connectionString: url };
  const u = new URL(url);
  for (const k of SSL_PARAMS) u.searchParams.delete(k);
  return { connectionString: u.toString(), ssl: { ca, rejectUnauthorized: true } };
}
