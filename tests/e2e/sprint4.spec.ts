import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../lib/generated/prisma/client';

/**
 * Sprint 4 (PRD §15): «المؤسسة ترى المتقدّم فقط إذا وافق على مشاركة ملفه».
 * مؤسسة تنشئ فرصة ← أمين السر ينشرها ← شاب يتقدّم بموافقة (ConsentDialog) ← المؤسسة ترى ملفه وتواصله (D31).
 * المؤسسة تُهيَّأ في قاعدة البيانات (ربط ممثلها مختبَر في sprint3.spec.ts).
 */
config({ path: '.env.local' });
const PASSWORD = 'Rafah2026test';


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

async function withDb<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
  try {
    return await fn(db);
  } finally {
    await db.$disconnect();
  }
}

test('فرصة من مؤسسة ← نشر أمين السر ← تقديم بموافقة ← المؤسسة ترى الملف', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'مسار واحد لكل تشغيل');
  test.setTimeout(300_000);
  const tag = randomUUID().slice(0, 6);
  const title = `تدريب تصميم ${tag}`;

  // ممثل المؤسسة مربوط بها (D26) — التهيئة في القاعدة، مع دور partner كما يمنحه الربط
  const rep = await accountPage(browser, `ممثل-${tag}`, 'partner');
  await withDb(async (db) => {
    const user = await db.user.findUniqueOrThrow({ where: { email: rep.email } });
    await db.organization.create({
      data: { name: `مؤسسة النور ${tag}`, type: 'LOCAL_NGO', members: { create: { userId: user.id } } },
    });
  });

  // 1) المؤسسة تنشئ فرصة ← بانتظار المراجعة
  await rep.page.goto('/partner/opportunities/new');
  await rep.page.getByLabel('عنوان الفرصة').fill(title);
  await rep.page.getByLabel('الوصف والشروط').fill('تدريب عملي لثلاثة أشهر في تصميم المحتوى الرقمي، بمكافأة شهرية.');
  await rep.page.getByLabel('النوع').selectOption('TRAINING');
  await rep.page.getByRole('button', { name: 'إرسال للمراجعة' }).click();
  await expect(rep.page.getByText('وصلت الفرصة لأمانة السر للمراجعة')).toBeVisible({ timeout: 45_000 });

  // لا تظهر للشباب قبل النشر
  const youth = await accountPage(browser, `شاب-${tag}`);
  await youth.page.goto('/opportunities');
  await expect(youth.page.getByText(title)).toHaveCount(0);

  // 2) أمين السر ينشرها
  const secretary = await accountPage(browser, `أمين-سر-${tag}`, 'secretary');
  await secretary.page.goto('/admin/opportunities');
  const card = secretary.page.locator('div.rounded-xl').filter({ hasText: title }).first();
  await card.getByRole('button', { name: 'نشر الفرصة' }).click();
  await expect(secretary.page.getByText('نُشرت الفرصة')).toBeVisible({ timeout: 45_000 });

  // 3) الشاب يتقدّم: الحوار يعرض ما يُشارك ومع من، والرفض هو الافتراضي
  await youth.page.goto('/opportunities');
  await youth.page.getByRole('link', { name: title }).click();
  await youth.page.getByLabel('رسالة للجهة (اختيارية)').fill('أعمل في التصميم منذ سنتين.');
  await youth.page.getByRole('button', { name: 'تقديم الطلب' }).click();
  const dialog = youth.page.getByRole('dialog', { name: `مشاركة بياناتك مع مؤسسة النور ${tag} لهذا الطلب فقط` });
  await expect(dialog).toBeVisible();

  // إغلاق دون قرار (Esc الثاني في Chrome أو زر الرجوع في أندرويد): لا طلب، والحوار يعود بالضغط مجددًا
  await youth.page.evaluate(() => document.querySelector<HTMLDialogElement>('dialog[open]')?.close());
  await expect(dialog).toBeHidden();
  const applications = await withDb(async (db) => {
    const u = await db.user.findUniqueOrThrow({ where: { email: youth.email } });
    return db.opportunityApplication.count({ where: { applicantId: u.id } });
  });
  expect(applications).toBe(0);
  await youth.page.getByRole('button', { name: 'تقديم الطلب' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(`مؤسسة النور ${tag}`, { exact: true })).toBeVisible();
  await expect(dialog.getByText('بريدك الإلكتروني ورقم جوّالك')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'أرسل دون مشاركة ملفي' })).toBeFocused();
  // Esc لا يغلقه دون قرار
  await youth.page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'أوافق وأرسل الطلب' }).click();
  await expect(youth.page.getByText('ووافقت على مشاركة ملفك').first()).toBeVisible({ timeout: 45_000 });

  await youth.page.goto('/me/applications');
  await expect(youth.page.getByText(title)).toBeVisible();
  await expect(youth.page.getByText('شاركت ملفك مع الجهة')).toBeVisible();

  // 4) المؤسسة ترى الطلب، وتطلب الملف صراحةً فيصلها الاسم والبريد
  await rep.page.goto('/partner/opportunities');
  const mine = rep.page.locator('li').filter({ hasText: title }).first();
  await expect(mine.getByText('وافق على مشاركة ملفه')).toBeVisible();
  await mine.getByRole('button', { name: 'عرض بيانات المتقدّم' }).click();
  await expect(mine.getByText(`شاب-${tag}`)).toBeVisible({ timeout: 45_000 });
  await expect(mine.getByText(youth.email)).toBeVisible();
  await expect(mine.getByText('أعمل في التصميم منذ سنتين.')).toBeVisible();

  // القراءة مسجّلة في التدقيق باسم ممثل المؤسسة (AC-11 ③)
  const audited = await withDb(async (db) => {
    const reader = await db.user.findUniqueOrThrow({ where: { email: rep.email } });
    return db.auditLog.count({ where: { action: 'application.view', actorId: reader.id } });
  });
  expect(audited).toBe(1);
});

test('360px: الفرص والأنشطة والملف بلا تمرير أفقي', async ({ browser }, info) => {
  test.skip(info.project.name !== 'mobile-360', 'فحص الجوّال وحده');
  test.setTimeout(180_000);
  const youth = await accountPage(browser, `شاب-جوال-${randomUUID().slice(0, 6)}`);
  await youth.page.setViewportSize({ width: 360, height: 780 });
  for (const path of ['/opportunities', '/activities', '/me/profile']) {
    await youth.page.goto(path);
    await expect(youth.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 45_000 });
    const overflow = await youth.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
