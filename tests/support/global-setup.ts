import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import type { TestProject } from 'vitest/node';
import { PrismaClient } from '../../lib/generated/prisma/client';
import { seedCommittees, seedDevReference, seedDevTerm, seedSkills } from '../../prisma/seed';
import { seedRbac } from '../../prisma/rbac.seed';

declare module 'vitest' {
  export interface ProvidedContext {
    pgliteDir: string;
  }
}

/**
 * قاعدة PostgreSQL حقيقية (PGlite) لاختبارات التكامل: تُبنى مرة على القرص من ملفات prisma/migrations نفسها
 * (بما فيها sql/constraints.sql) ثم البذرة، وتفتحها ملفات الاختبار تباعًا داخل العملية.
 */
export async function applyMigrations(pg: PGlite) {
  const dir = path.resolve(import.meta.dirname, '../../prisma/migrations');
  const migrations = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const m of migrations) await pg.exec(await readFile(path.join(dir, m, 'migration.sql'), 'utf8'));
}

/**
 * أدوار Supabase ومنحها الافتراضية كما في المشروع الحقيقي، قبل الـ migrations — فيختبر
 * tests/integration/data-api-lockdown.test.ts أن migration الإغلاق (C-1) يسحبها فعلًا، لا أنها لم تُمنح أصلًا.
 */
export async function simulateSupabaseRoles(pg: PGlite) {
  await pg.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
  `);
}

export default async function setup(project: TestProject) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'rafah-pglite-'));
  const pg = new PGlite(dataDir);
  await simulateSupabaseRoles(pg);
  await applyMigrations(pg);

  const db = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  await seedRbac(db);
  await seedCommittees(db);
  await seedSkills(db);
  await seedDevTerm(db);
  await seedDevReference(db);
  await db.$disconnect();
  await pg.close();

  project.provide('pgliteDir', dataDir);
  return async () => {
    await rm(dataDir, { recursive: true, force: true });
  };
}
