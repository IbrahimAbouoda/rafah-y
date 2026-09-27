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

// D32: قائمة المهارات المرجعية — في الإنتاج أيضًا (لا مسار لإدارتها في §11.2 بعد).
// عامة لا تخص أحدًا، يعدّلها المجلس لاحقًا بقرار موثّق.
export const BASE_SKILLS = [
  { nameAr: 'التصميم الجرافيكي', category: 'مهارات رقمية' },
  { nameAr: 'البرمجة وتطوير الويب', category: 'مهارات رقمية' },
  { nameAr: 'التسويق الرقمي وإدارة المنصات', category: 'مهارات رقمية' },
  { nameAr: 'التصوير والمونتاج', category: 'مهارات رقمية' },
  { nameAr: 'الحاسوب والبرامج المكتبية', category: 'مهارات رقمية' },
  { nameAr: 'إدخال البيانات وتحليلها', category: 'مهارات رقمية' },
  { nameAr: 'اللغة الإنجليزية', category: 'لغات' },
  { nameAr: 'الترجمة', category: 'لغات' },
  { nameAr: 'إدارة المشاريع', category: 'مهارات مهنية' },
  { nameAr: 'كتابة المقترحات والتقارير', category: 'مهارات مهنية' },
  { nameAr: 'المحاسبة الأساسية', category: 'مهارات مهنية' },
  { nameAr: 'ريادة الأعمال', category: 'مهارات مهنية' },
  { nameAr: 'خدمة العملاء', category: 'مهارات مهنية' },
  { nameAr: 'الإسعافات الأولية', category: 'مهارات مجتمعية' },
  { nameAr: 'الدعم النفسي الاجتماعي', category: 'مهارات مجتمعية' },
  { nameAr: 'التيسير والتدريب', category: 'مهارات مجتمعية' },
  { nameAr: 'تنظيم الفعاليات', category: 'مهارات مجتمعية' },
  { nameAr: 'العمل مع الأطفال', category: 'مهارات مجتمعية' },
  { nameAr: 'الصيانة الكهربائية', category: 'مهارات حِرفية' },
  { nameAr: 'الطاقة الشمسية', category: 'مهارات حِرفية' },
  { nameAr: 'الخياطة والتطريز', category: 'مهارات حِرفية' },
  { nameAr: 'الزراعة المنزلية', category: 'مهارات حِرفية' },
] as const;

export async function seedSkills(db: PrismaClient) {
  // لا نغيّر مهارة موجودة: قد يكون المجلس عدّلها
  for (const s of BASE_SKILLS) await db.skill.upsert({ where: { nameAr: s.nameAr }, create: s, update: {} });
}

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

// صاحب الأفكار التجريبية: حساب وهمي معطّل لا يدخل (isActive = false) — يُحذف مع بيانات isDemo في Sprint 6 (AC-20)
const DEMO_SUBMITTER = { email: 'demo-ideas@example.invalid', fullName: 'حساب عرض تجريبي' };

const DEMO_IDEAS = [
  {
    title: 'عرض: مساحة دراسة مسائية للطلاب',
    problem: 'فكرة عرض تجريبية: لا يوجد مكان هادئ ومضاء للدراسة مساءً في المنطقة التجريبية.',
    solution: 'تجهيز قاعة في المركز الشبابي بإنارة ومقاعد وفتحها من السادسة حتى العاشرة مساءً.',
    status: 'COMMITTEE_REVIEW' as const,
    committee: 'activities-initiatives',
    votes: 0,
  },
  {
    title: 'عرض: دوري كرة قدم بين الأحياء',
    problem: 'فكرة عرض تجريبية: الشباب بلا نشاط رياضي منظّم في الصيف، والملاعب شبه فارغة.',
    solution: 'دوري من ثمانية فرق على ملعبين، بتحكيم متطوعين وجوائز رمزية من مؤسسة داعمة.',
    status: 'SCREENING' as const,
    committee: null,
    votes: 0,
  },
  {
    title: 'عرض: خريطة رقمية لنقاط المياه',
    problem: 'فكرة عرض تجريبية: الأهالي لا يعرفون أين ومتى تتوفر نقاط تعبئة المياه في الحي.',
    solution: 'صفحة بسيطة تحدّثها لجنة التكنولوجيا يوميًا بمواقع النقاط ومواعيدها.',
    status: 'APPROVED' as const,
    committee: 'technology-digital-systems',
    votes: 0,
  },
  {
    title: 'عرض: ورشة إسعافات أولية للشابات',
    problem: 'فكرة عرض تجريبية: قلة من يعرفن الإسعافات الأولية الأساسية في الحي التجريبي.',
    solution: 'ثلاث ورش مع متطوعات من القطاع الصحي، ومنح شهادة حضور للمشاركات.',
    status: 'SUBMITTED' as const,
    committee: null,
    votes: 0,
  },
];

/** أفكار عرض بحالات مختلفة لتجربة /ideas والفرز ولوحة اللجنة. تُنشأ مرة واحدة. */
export async function seedDemoIdeas(db: PrismaClient): Promise<string[]> {
  if ((await db.idea.count({ where: { isDemo: true } })) > 0) return [];
  const submitter = await db.user.upsert({
    where: { email: DEMO_SUBMITTER.email },
    create: { ...DEMO_SUBMITTER, authId: crypto.randomUUID(), isActive: false },
    update: {},
  });
  const year = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Gaza' }).format(new Date());
  const areas = await db.area.findMany({ orderBy: { nameAr: 'asc' }, select: { id: true } });
  const refs: string[] = [];
  for (const [i, idea] of DEMO_IDEAS.entries()) {
    const committee = idea.committee ? await db.committee.findUnique({ where: { slug: idea.committee }, select: { id: true } }) : null;
    const ref = await db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ ref: string }[]>`SELECT next_ref(${`IDA-${year}`}, 6) AS ref`;
      await tx.idea.create({
        data: {
          reference: row!.ref,
          title: idea.title,
          problem: idea.problem,
          solution: idea.solution,
          status: idea.status,
          committeeId: committee?.id ?? null,
          areaId: areas[i % Math.max(areas.length, 1)]?.id ?? null,
          submitterId: submitter.id,
          isDemo: true,
        },
      });
      return row!.ref;
    });
    refs.push(ref);
  }
  return refs;
}

/** مبادرة عرض منشورة باحتياجات مرقّمة، ومؤسسة عرض — لتجربة /initiatives و /support و /partner/needs */
export async function seedDemoInitiatives(db: PrismaClient): Promise<string | null> {
  if ((await db.initiative.count({ where: { isDemo: true } })) > 0) return null;
  const creator = await db.user.upsert({
    where: { email: DEMO_SUBMITTER.email },
    create: { ...DEMO_SUBMITTER, authId: crypto.randomUUID(), isActive: false },
    update: {},
  });
  const committee = await db.committee.findUnique({ where: { slug: 'activities-initiatives' }, select: { id: true } });
  await db.organization.create({
    data: { name: 'مؤسسة عرض تجريبية', type: 'LOCAL_NGO', sectors: ['تمكين الشباب'], stage: 'CONTACTED', isDemo: true },
  });
  const initiative = await db.initiative.create({
    data: {
      slug: 'demo-summer-workshops',
      title: 'عرض: ورش صيفية للمهارات الرقمية',
      summary: 'مبادرة عرض تجريبية: ثلاث ورش صيفية لثلاثين شابًا في التصميم والبرمجة.',
      status: 'PUBLISHED',
      committeeId: committee?.id ?? null,
      estimatedBudget: '6000',
      beneficiariesTarget: 30,
      createdById: creator.id,
      approvedAt: new Date(),
      isDemo: true,
      needs: {
        create: [
          { type: 'FUNDING', description: 'تمويل أدوات الورش ومواصلات المشاركين', amount: '3500', sortOrder: 1 },
          { type: 'TRAINER', description: 'مدرّب تصميم جرافيك', quantity: 1, unit: 'مدرّب', sortOrder: 2 },
          { type: 'VENUE', description: 'قاعة بثلاثين مقعدًا وشبكة إنترنت', quantity: 6, unit: 'أيام', sortOrder: 3 },
          { type: 'EQUIPMENT', description: 'أجهزة حاسوب محمولة', quantity: 10, unit: 'جهاز', sortOrder: 4 },
        ],
      },
    },
  });
  return initiative.slug;
}

/** فرصة عرض منشورة ونشاط عرض منشور — لتجربة /opportunities و /activities. تُنشأ مرة واحدة. */
export async function seedDemoOpportunities(db: PrismaClient): Promise<boolean> {
  if ((await db.opportunity.count({ where: { isDemo: true } })) > 0) return false;
  const creator = await db.user.upsert({
    where: { email: DEMO_SUBMITTER.email },
    create: { ...DEMO_SUBMITTER, authId: crypto.randomUUID(), isActive: false },
    update: {},
  });
  const org =
    (await db.organization.findFirst({ where: { isDemo: true }, select: { id: true } })) ??
    (await db.organization.create({
      data: { name: 'مؤسسة عرض تجريبية', type: 'LOCAL_NGO', sectors: ['تمكين الشباب'], stage: 'CONTACTED', isDemo: true },
      select: { id: true },
    }));
  const skills = await db.skill.findMany({
    where: { nameAr: { in: ['التصميم الجرافيكي', 'التسويق الرقمي وإدارة المنصات'] } },
    select: { id: true },
  });
  const month = 30 * 24 * 3600_000;
  await db.opportunity.create({
    data: {
      title: 'عرض: تدريب مدفوع في التصميم الرقمي',
      description: 'فرصة عرض تجريبية: تدريب عملي لثلاثة أشهر في تصميم المحتوى الرقمي لمؤسسة محلية، مع مكافأة شهرية رمزية.',
      type: 'TRAINING',
      applyMode: 'INTERNAL',
      seats: 5,
      deadline: new Date(Date.now() + month),
      status: 'PUBLISHED',
      organizationId: org.id,
      createdById: creator.id,
      publishedAt: new Date(),
      isDemo: true,
      skills: { create: skills.map((s) => ({ skillId: s.id })) },
    },
  });
  const committee = await db.committee.findUnique({ where: { slug: 'technology-digital-systems' }, select: { id: true } });
  await db.activity.create({
    data: {
      title: 'عرض: ورشة أساسيات الأمان الرقمي',
      description: 'نشاط عرض تجريبي: ورشة ساعتين عن كلمات المرور وحماية الحسابات من الاحتيال.',
      kind: 'WORKSHOP',
      committeeId: committee?.id ?? null,
      startsAt: new Date(Date.now() + 7 * 24 * 3600_000),
      location: 'قاعة تجريبية',
      seats: 20,
      registrationOpen: true,
      status: 'PUBLISHED',
      createdById: creator.id,
      isDemo: true,
    },
  });
  return true;
}

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Set DIRECT_URL (or DATABASE_URL) before seeding');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    await seedRbac(db);
    await seedCommittees(db);
    await seedSkills(db);
    const dev = process.env.NODE_ENV !== 'production';
    let demo: { reference: string; code: string }[] = [];
    let ideas: string[] = [];
    let initiative: string | null = null;
    let opportunities = false;
    if (dev) {
      await seedDevTerm(db);
      await seedDevReference(db);
      demo = await seedDemoComplaints(db);
      ideas = await seedDemoIdeas(db);
      initiative = await seedDemoInitiatives(db);
      opportunities = await seedDemoOpportunities(db);
    }

    const grants = PERMISSIONS.reduce((n, p) => n + Object.keys(p.grants).length, 0);
    console.log(`✓ ${ROLES.length} أدوار · ${PERMISSIONS.length} صلاحية · ${grants} منحة`);
    console.log(`✓ ${INITIAL_COMMITTEES.length} لجان · ${BASE_SKILLS.length} مهارة`);
    if (dev) console.log(`✓ تطوير: ${DEV_CATEGORIES.length} تصنيفات · ${DEV_AREAS.length} مناطق تجريبية`);
    for (const d of demo) console.log(`  شكوى عرض ${d.reference} · رمز ${d.code}`);
    if (ideas.length) console.log(`  أفكار عرض: ${ideas.join(' · ')}`);
    if (initiative) console.log(`  مبادرة عرض: /initiatives/${initiative}`);
    if (opportunities) console.log('  فرصة ونشاط عرض: /opportunities · /activities');
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
