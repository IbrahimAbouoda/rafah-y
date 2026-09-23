// بذرة قاعدة البيانات: npx prisma db seed
// الإنتاج: المصفوفة + اللجان فقط. التطوير: إضافةً دورة تجريبية (PRD §18 Q5)، وتصنيفات ومناطق تجريبية،
// وشكاوى عرض بعلامة isDemo = true (§15 قاعدة 4) — تُحذف كلها قبل الإطلاق.
// لا بيانات حقيقية هنا أبدًا (C6)، ولا مستخدمين: أول دور إداري يُمنح بـ `npm run admin:grant`.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { formatAccessCode, generateAccessCode, hashAccessCode } from '../lib/complaints/access-code';
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

// ─── التطوير فقط ─────────────────────────────────────────────────
// التصنيفات والمناطق الحقيقية يضيفها المجلس من /admin/settings؛ هذه للتجربة المحلية فقط.
// التصنيف ← اللجنة المقترحة بالـ slug (§4.3) — تُعدَّل من الإعدادات.
export const DEV_CATEGORIES = [
  { nameAr: 'الخدمات البلدية والبنية التحتية', committee: 'logistical-support' },
  { nameAr: 'الصحة', committee: 'health-affairs' },
  { nameAr: 'الأنشطة والمرافق الشبابية', committee: 'activities-initiatives' },
  { nameAr: 'قضايا المرأة', committee: 'women-empowerment' },
  { nameAr: 'الرياضة والفنون', committee: 'sports-arts' },
  { nameAr: 'الشؤون القانونية', committee: 'legal-affairs' },
  { nameAr: 'الخدمات الرقمية', committee: 'technology-digital-systems' },
] as const;

// أسماء مناطق تجريبية صريحة — لا عناوين حقيقية (C6)
export const DEV_AREAS = ['منطقة تجريبية (أ)', 'منطقة تجريبية (ب)', 'منطقة تجريبية (ج)'] as const;

export async function seedDevReference(db: PrismaClient) {
  for (const [i, c] of DEV_CATEGORIES.entries()) {
    const committee = await db.committee.findUnique({ where: { slug: c.committee }, select: { id: true } });
    await db.complaintCategory.upsert({
      where: { nameAr: c.nameAr },
      create: { nameAr: c.nameAr, defaultCommitteeId: committee?.id ?? null, sortOrder: i + 1 },
      update: {},
    });
  }
  for (const nameAr of DEV_AREAS) await db.area.upsert({ where: { nameAr }, create: { nameAr }, update: {} });
}

const DEMO_COMPLAINTS = [
  { title: 'عرض: انقطاع الإنارة في شارع تجريبي', body: 'شكوى عرض تجريبية: الإنارة معطلة منذ أسبوعين في الشارع الرئيسي للمنطقة التجريبية، والمكان مظلم ليلًا.' },
  { title: 'عرض: لا يوجد ملعب مفتوح للشباب', body: 'شكوى عرض تجريبية: الملعب الوحيد في المنطقة التجريبية مغلق منذ شهر دون إعلان موعد لإعادة فتحه.' },
  { title: 'عرض: تأخر رد العيادة على المواعيد', body: 'شكوى عرض تجريبية: الحجز في العيادة يتأخر أكثر من أسبوعين، ولا توجد وسيلة لمعرفة الموعد إلا بالحضور.' },
] as const;

/** شكاوى عرض مجهولة بلا بيانات تواصل. تُنشأ مرة واحدة، ويُطبع رقمها ورمزها لتجربة /track. */
export async function seedDemoComplaints(db: PrismaClient): Promise<{ reference: string; code: string }[]> {
  if ((await db.complaint.count({ where: { isDemo: true } })) > 0) return [];
  const year = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Gaza' }).format(new Date());
  const categories = await db.complaintCategory.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true } });
  const areas = await db.area.findMany({ orderBy: { nameAr: 'asc' }, select: { id: true } });
  const out: { reference: string; code: string }[] = [];
  for (const [i, c] of DEMO_COMPLAINTS.entries()) {
    const code = generateAccessCode();
    const accessCodeHash = await hashAccessCode(code);
    const reference = await db.$transaction(async (tx) => {
      // next_ref() حصرًا، داخل المعاملة (§16.2)
      const [row] = await tx.$queryRaw<{ ref: string }[]>`SELECT next_ref(${`CMP-${year}`}, 6) AS ref`;
      const complaint = await tx.complaint.create({
        data: {
          reference: row!.ref,
          accessCodeHash,
          title: c.title,
          body: c.body,
          isAnonymous: true,
          categoryId: categories[i % categories.length]?.id ?? null,
          areaId: areas[i % areas.length]?.id ?? null,
          isDemo: true,
        },
      });
      await tx.complaintEvent.create({
        data: { complaintId: complaint.id, toStatus: 'SUBMITTED', isPublic: true, note: 'استُلمت الشكوى وسُجّلت برقمها المرجعي.' },
      });
      await tx.auditLog.create({
        data: {
          actorRoles: ['system:seed'],
          action: 'complaint.create',
          entityType: 'Complaint',
          entityId: complaint.id,
          after: { reference: complaint.reference, status: complaint.status, isAnonymous: true, isDemo: true },
        },
      });
      return complaint.reference;
    });
    out.push({ reference, code: formatAccessCode(code) });
  }
  return out;
}

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Set DIRECT_URL (or DATABASE_URL) before seeding');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    await seedRbac(db);
    await seedCommittees(db);
    const dev = process.env.NODE_ENV !== 'production';
    let demo: { reference: string; code: string }[] = [];
    if (dev) {
      await seedDevTerm(db);
      await seedDevReference(db);
      demo = await seedDemoComplaints(db);
    }

    const grants = PERMISSIONS.reduce((n, p) => n + Object.keys(p.grants).length, 0);
    console.log(`✓ ${ROLES.length} أدوار · ${PERMISSIONS.length} صلاحية · ${grants} منحة`);
    console.log(`✓ ${INITIAL_COMMITTEES.length} لجان`);
    if (dev) console.log(`✓ تطوير: ${DEV_CATEGORIES.length} تصنيفات · ${DEV_AREAS.length} مناطق تجريبية`);
    for (const d of demo) console.log(`  شكوى عرض ${d.reference} · رمز ${d.code}`);
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
