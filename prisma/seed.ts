// بذرة قاعدة البيانات: npx prisma db seed
// الإنتاج: المصفوفة + اللجان فقط. التطوير: إضافةً دورة تجريبية (PRD §18 Q5).
// لا بيانات حقيقية هنا أبدًا (C6)، ولا مستخدمين: أول دور إداري يُمنح بـ `npm run admin:grant`.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { seedRbac, PERMISSIONS, ROLES } from './rbac.seed';

// PRD §4.3
export const INITIAL_COMMITTEES = [
  { nameAr: 'لجنة التكنولوجيا والأنظمة الرقمية', slug: 'technology-digital-systems' },
  { nameAr: 'لجنة الأنشطة والمبادرات', slug: 'activities-initiatives' },
  { nameAr: 'لجنة المؤسسات والشراكات', slug: 'organizations-partnerships' },
  { nameAr: 'لجنة المرأة', slug: 'women-empowerment' },
  { nameAr: 'اللجنة القانونية', slug: 'legal-affairs' },
  { nameAr: 'اللجنة الرياضية والفنية', slug: 'sports-arts' },
  { nameAr: 'لجنة العلاقات العامة والإعلام', slug: 'public-relations-media' },
  { nameAr: 'اللجنة الصحية', slug: 'health-affairs' },
  { nameAr: 'لجنة الدعم اللوجستي', slug: 'logistical-support' },
] as const;

export const DEV_TERM_NAME = 'دورة تجريبية — للتطوير فقط';

export async function seedCommittees(db: PrismaClient) {
  for (const [i, c] of INITIAL_COMMITTEES.entries()) {
    // لا نغيّر لجنة موجودة: قد يكون المدير التقني عدّلها من الإعدادات
    await db.committee.upsert({ where: { slug: c.slug }, create: { ...c, sortOrder: i + 1 }, update: {} });
  }
}

export async function seedDevTerm(db: PrismaClient) {
  const current = await db.councilTerm.findFirst({ where: { isCurrent: true } });
  if (current) return;
  await db.councilTerm.create({ data: { name: DEV_TERM_NAME, startsAt: new Date(), isCurrent: true } });
}

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Set DIRECT_URL (or DATABASE_URL) before seeding');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    await seedRbac(db);
    await seedCommittees(db);
    if (process.env.NODE_ENV !== 'production') await seedDevTerm(db);

    const grants = PERMISSIONS.reduce((n, p) => n + Object.keys(p.grants).length, 0);
    console.log(`✓ ${ROLES.length} أدوار · ${PERMISSIONS.length} صلاحية · ${grants} منحة`);
    console.log(`✓ ${INITIAL_COMMITTEES.length} لجان`);
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('prisma/seed.ts')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
