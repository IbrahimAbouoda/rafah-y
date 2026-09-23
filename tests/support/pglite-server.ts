// خادم PostgreSQL حقيقي (PGlite عبر بروتوكول pg) للاختبارات وفحص الـ migrations بلا Docker.
// الاستخدام اليدوي: npx tsx tests/support/pglite-server.ts 55432
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

export async function startPgliteServer(port: number) {
  const db = await PGlite.create();
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 20, debug: process.env.PGLITE_DEBUG === '1' });
  await server.start();
  return {
    url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`,
    async stop() {
      await server.stop();
      await db.close();
    },
  };
}

if (process.argv[1]?.endsWith('pglite-server.ts')) {
  const port = Number(process.argv[2] ?? 55432);
  startPgliteServer(port).then(({ url }) => console.log(`ready ${url}`));
}
