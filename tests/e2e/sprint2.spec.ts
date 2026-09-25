import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../lib/generated/prisma/client';

/**
 * Sprint 2 (PRD §15): «العضو لا يعتمد مهمته، ورئيس اللجنة لا يرى لجنة غيره».
 * E2E الملف: رئيس لجنة ينشئ مهمة من شكوى ← العضو ينقلها إلى REVIEW ← الرئيس يعتمدها ← تظهر في سجل الشكوى.
 * + فكرة: تقديم ← فرز ← تأييد من شاب آخر.
 * الشكوى المحوّلة تُهيَّأ مباشرة في قاعدة البيانات (مسارها مختبَر في sprint1.spec).
 */
config({ path: '.env.local' });
const PASSWORD = 'Rafah2026test';

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'مسار واحد لكل تشغيل');
});

async function createAccount(fullName: string): Promise<string> {
  const email = `e2e-${randomUUID().slice(0, 8)}@example.test`;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName } }),
  });
  if (!res.ok) throw new Error(`admin createUser ${res.status}`);
  return email;
}

async function accountPage(browser: Browser, fullName: string, grant?: string): Promise<Page> {
  const email = await createAccount(fullName);
  const page = await (await browser.newContext({ locale: 'ar' })).newPage();
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني أو رقم الجوّال').fill(email);
  await page.getByLabel('كلمة المرور').fill(PASSWORD);
  await page.getByRole('button', { name: 'دخول' }).click();
  await expect(page).toHaveURL(/\/(me|admin)/, { timeout: 45_000 });
  if (grant) execSync(`npm run admin:grant -- ${email} ${grant}`, { stdio: 'pipe' });
  return page;
}

async function assignedComplaint(slug: string, title: string): Promise<string> {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
  try {
    const committee = await db.committee.findUniqueOrThrow({ where: { slug } });
    const year = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Gaza' }).format(new Date());
    return await db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ ref: string }[]>`SELECT next_ref(${`CMP-${year}`}, 6) AS ref`;
      const c = await tx.complaint.create({
        data: {
          reference: row!.ref,
          accessCodeHash: 'scrypt$e2e$e2e',
          title,
          body: 'شكوى اختبار محوّلة للجنة لتتحول إلى مهمة.',
          isAnonymous: true,
          status: 'ASSIGNED',
          committeeId: committee.id,
        },
      });
      return c.id;
    });
  } finally {
    await db.$disconnect();
  }
}

test('مهمة من شكوى: الرئيس ينشئ ← العضو إلى «مراجعة» بلا زر اعتماد ← الرئيس يعتمد ← سجل الشكوى', async ({ browser }) => {
  test.setTimeout(240_000);
  const tag = randomUUID().slice(0, 6);
  const memberName = `عضو-${tag}`;
  const title = `عطل مولّد الحي ${tag}`;
  const complaintId = await assignedComplaint('logistical-support', title);

  const head = await accountPage(browser, `رئيس-لجنة-${tag}`, 'committee_head logistical-support');
  const member = await accountPage(browser, memberName, 'committee_member logistical-support');

  // AC-05: من الشكوى — العنوان معبّأ، والمسند إليه من أعضاء اللجنة
  await head.goto(`/admin/complaints/${complaintId}`);
  await head.getByText('أنشئ مهمة من الشكوى').click();
  await expect(head.getByLabel('عنوان المهمة')).toHaveValue(`متابعة: ${title}`);
  await head.getByLabel('المسند إليه').selectOption({ label: `${memberName} (عضو اللجنة)` });
  await head.getByRole('button', { name: 'إنشاء المهمة وإسنادها' }).click();
  await expect(head.getByText('أُنشئت المهمة وأُشعر المسند إليه.')).toBeVisible();

  // AC-06: العضو ينقل مهمته حتى «مراجعة» ولا يرى زر الاعتماد (①)
  await member.goto('/admin/tasks');
  await expect(member.getByText(`متابعة: ${title}`)).toBeVisible();
  await member.getByRole('button', { name: 'تنفيذ' }).click();
  await expect(member.getByText('المهمة الآن: تنفيذ.')).toBeVisible();
  await member.getByRole('button', { name: 'مراجعة' }).click();
  await expect(member.getByText('المهمة الآن: مراجعة.')).toBeVisible();
  await expect(member.getByRole('button', { name: 'اعتماد' })).toHaveCount(0);

  // الرئيس يعتمد من لوحة مهام اللجنة
  await head.goto('/admin/committees/logistical-support/tasks');
  // البطاقة نفسها لا العمود: قد يحوي العمود بطاقات مهام أخرى في «مراجعة»
  const card = head.locator('section[aria-label="مراجعة"] > div').filter({ hasText: `متابعة: ${title}` });
  await card.getByRole('button', { name: 'اعتماد' }).click();
  await expect(head.getByText('اعتُمدت المهمة منجزة.')).toBeVisible();

  // ④ الإنجاز في سجل الشكوى
  await head.goto(`/admin/complaints/${complaintId}`);
  await expect(head.getByText(`أُنجزت واعتُمدت المهمة: متابعة: ${title}`)).toBeVisible();

  // معيار الإنجاز: رئيس اللجنة لا يرى لجنة غيره
  // /admin يبث الصفحة (loading.tsx)، فيصل notFound() بحالة 200 وصفحة «غير موجودة» — المهم أن لا شيء من اللجنة يظهر
  await head.goto('/admin/committees/health-affairs');
  await expect(head.getByRole('heading', { name: 'الصفحة غير موجودة' })).toBeVisible();
  await expect(head.getByText('اللجنة الصحية')).toHaveCount(0);
});

test('فكرة: تقديم ← فرز أمانة السر ← تأييد شاب آخر مرة واحدة', async ({ browser }) => {
  test.setTimeout(240_000);
  const tag = randomUUID().slice(0, 6);
  const ideaTitle = `مكتبة متنقلة للأطفال ${tag}`;

  const youth = await accountPage(browser, `صاحب-فكرة-${tag}`);
  await youth.goto('/me/ideas/new');
  await youth.getByLabel('عنوان الفكرة').fill(ideaTitle);
  await youth.getByLabel('المشكلة').fill('الأطفال في الحي التجريبي بلا كتب ولا مكان للقراءة بعد المدرسة.');
  await youth.getByLabel('الحل المقترح').fill('عربة كتب تزور ثلاث مدارس أسبوعيًا بمتطوعين من الشباب.');
  await youth.getByLabel('الكلفة التقديرية بالشيكل (اختيارية)').fill('2400');
  await youth.getByRole('button', { name: 'إرسال الفكرة' }).click();
  await expect(youth.getByTestId('idea-reference')).toHaveText(/^RF-IDA-\d{4}-\d{6}$/);

  const secretary = await accountPage(browser, `أمين-سر-${tag}`, 'secretary');
  await secretary.goto('/admin/ideas');
  await secretary.getByRole('link', { name: ideaTitle }).click();
  await secretary.waitForURL(/\/admin\/ideas\/[0-9a-f-]{36}$/);
  const ideaId = secretary.url().split('/').pop()!;
  await secretary.getByRole('button', { name: 'بدء الفرز ونشرها' }).click();
  await expect(secretary.getByText('الفكرة الآن: فرز أولي.')).toBeVisible();

  const voter = await accountPage(browser, `مؤيد-${tag}`);
  await voter.goto(`/ideas/${ideaId}`);
  await voter.getByRole('button', { name: 'أؤيّد · 0' }).click();
  await expect(voter.getByText('1 صوت · صوّتّ لها')).toBeVisible();
  await voter.reload();
  await expect(voter.getByRole('button', { name: /أؤيّد/ })).toHaveCount(0);
});
