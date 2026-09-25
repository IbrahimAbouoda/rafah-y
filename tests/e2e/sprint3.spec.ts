import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../lib/generated/prisma/client';

/**
 * Sprint 3 (PRD §15): «قبول عرض دعم يحدّث الاحتياج والشركاء، والمبلغ المؤمَّن من قيد معتمد».
 * احتياج ← ربط ممثل المؤسسة (D26) ← عرض دعم ← قبول الرئيس ← قيد يسجّله أمين الصندوق (D29) ← يعتمده الرئيس ← المبلغ المؤمَّن يتحدّث.
 * المبادرة المنشورة تُهيَّأ في قاعدة البيانات (مسار نشرها مختبَر تكامليًا).
 */
config({ path: '.env.local' });
const PASSWORD = 'Rafah2026test';

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'مسار واحد لكل تشغيل');
});

async function createAccount(fullName: string): Promise<string> {
  const email = `e2e-${randomUUID().slice(0, 8)}@example.test`;
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName } }),
  });
  if (!res.ok) throw new Error(`admin createUser ${res.status}`);
  return email;
}

async function accountPage(browser: Browser, fullName: string, grant?: string): Promise<{ page: Page; email: string }> {
  const email = await createAccount(fullName);
  const page = await (await browser.newContext({ locale: 'ar' })).newPage();
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني أو رقم الجوّال').fill(email);
  await page.getByLabel('كلمة المرور').fill(PASSWORD);
  await page.getByRole('button', { name: 'دخول' }).click();
  await expect(page).toHaveURL(/\/(me|admin|partner)/, { timeout: 45_000 });
  if (grant) execSync(`npm run admin:grant -- ${email} ${grant}`, { stdio: 'pipe' });
  return { page, email };
}

async function publishedInitiative(tag: string) {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
  try {
    const committee = await db.committee.findUniqueOrThrow({ where: { slug: 'activities-initiatives' } });
    const creator = await db.user.findFirstOrThrow({ where: { isActive: true } });
    const org = await db.organization.create({ data: { name: `مؤسسة الأمل ${tag}`, type: 'LOCAL_NGO' } });
    const initiative = await db.initiative.create({
      data: {
        slug: `e2e-${tag}`,
        title: `ورش البرمجة ${tag}`,
        status: 'PUBLISHED',
        approvedAt: new Date(),
        committeeId: committee.id,
        createdById: creator.id,
        needs: { create: [{ type: 'FUNDING', description: `أجهزة الورش ${tag}`, amount: '3000', sortOrder: 1 }] },
      },
      include: { needs: true },
    });
    return { orgId: org.id, orgName: org.name, initiative };
  } finally {
    await db.$disconnect();
  }
}

test('احتياج ← عرض مؤسسة ← قبول ← قيد أمين الصندوق ← اعتماد الرئيس ← المبلغ المؤمَّن', async ({ browser }) => {
  test.setTimeout(300_000);
  const tag = randomUUID().slice(0, 6);
  const { orgId, orgName, initiative } = await publishedInitiative(tag);

  // D26: ممثل المؤسسة يسجّل حسابًا، وأمين السر يربطه بالمؤسسة فيدخل بوابة المؤسسات
  const rep = await accountPage(browser, `ممثل-${tag}`);
  const secretary = await accountPage(browser, `أمين-سر-${tag}`, 'secretary');
  await secretary.page.goto(`/admin/organizations/${orgId}`);
  await secretary.page.getByLabel('ربط حساب ببريده').fill(rep.email);
  await secretary.page.getByRole('button', { name: 'ربط', exact: true }).click();
  // أول طلب لهذه الصفحة في خادم التطوير يترجمها مع إجرائها
  await expect(secretary.page.getByText(`بمؤسسة ${orgName}`)).toBeVisible({ timeout: 45_000 });

  // عرض الدعم على الاحتياج المرقّم
  await rep.page.goto('/partner/needs');
  const needRow = rep.page.locator('li').filter({ hasText: `أجهزة الورش ${tag}` });
  await needRow.getByText('قدّم عرضًا لهذا الاحتياج').click();
  await needRow.getByLabel('المبلغ (للتمويل فقط)').fill('3000');
  await needRow.getByRole('button', { name: 'إرسال عرض الدعم' }).click();
  // نتيجة الإجراء في رسالة الهيكل أعلى الصفحة
  await expect(rep.page.getByText('وصل عرضك')).toBeVisible();

  // الرئيس يقبل
  const president = await accountPage(browser, `رئيس-${tag}`, 'council_president');
  await president.page.goto(`/admin/initiatives/${initiative.id}`);
  await president.page.getByRole('button', { name: 'حفظ القرار' }).click();
  await expect(president.page.getByText(`أُضيفت ${orgName} شريكًا`)).toBeVisible();

  // الاحتياج مغطّى والمؤسسة شريكة، ولا مبلغ مؤمَّن قبل القيد المعتمد
  await president.page.goto(`/initiatives/${initiative.slug}`);
  await expect(president.page.getByText(orgName)).toBeVisible();
  await expect(president.page.getByText('مغطّاة')).toBeVisible();
  await expect(president.page.getByText('لا بيانات بعد').first()).toBeVisible();

  // D29: أمين الصندوق يسجّل القيد من «عروض مقبولة بانتظار قيدها»
  const treasurer = await accountPage(browser, `أمين-صندوق-${tag}`, 'treasurer');
  await treasurer.page.goto('/admin/finance');
  const pending = treasurer.page.locator('form').filter({ hasText: orgName });
  await pending.getByLabel('تاريخ الوصول').fill(new Date().toISOString().slice(0, 10));
  await pending.getByRole('button', { name: 'تسجيل القيد' }).click();
  await expect(treasurer.page.getByText('سُجّل القيد، وينتظر اعتماد الرئيس').first()).toBeVisible();
  // المسجِّل لا يرى زر اعتماد لقيده
  await expect(treasurer.page.getByRole('button', { name: 'اعتماد', exact: true })).toHaveCount(0);

  // الرئيس يعتمد ⇒ المبلغ المؤمَّن يتحدّث
  await president.page.goto('/admin/finance');
  const recordRow = president.page.locator('tr').filter({ hasText: orgName });
  await recordRow.getByRole('button', { name: 'اعتماد', exact: true }).click();
  await expect(president.page.getByText('اعتُمد القيد')).toBeVisible();

  await president.page.goto(`/initiatives/${initiative.slug}`);
  await expect(president.page.getByText('3,000 ₪').first()).toBeVisible();
});
