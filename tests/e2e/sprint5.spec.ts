import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { config } from 'dotenv';

/**
 * Sprint 5 (§17 بند 11) — مساران:
 * ① توليد تقرير ← نشره ← يظهر في /transparency بلا دخول ← تنزيل XLSX (AC-15)
 * ② سؤال بلا إجابة ← استفسار ← رد + تحويل إلى FAQ ← البوت يجده في المحاولة التالية (AC-18)
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

async function accountPage(browser: Browser, fullName: string, grant: string): Promise<Page> {
  const email = await createAccount(fullName);
  const page = await (await browser.newContext({ locale: 'ar' })).newPage();
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني أو رقم الجوّال').fill(email);
  await page.getByLabel('كلمة المرور').fill(PASSWORD);
  await page.getByRole('button', { name: 'دخول' }).click();
  await expect(page).toHaveURL(/\/(me|admin|partner)/, { timeout: 45_000 });
  execSync(`npm run admin:grant -- ${email} ${grant}`, { stdio: 'pipe' });
  return page;
}

const visitorPage = async (browser: Browser) => (await browser.newContext({ locale: 'ar' })).newPage();

test('تقرير: توليد ← نشر ← /transparency بلا دخول ← تنزيل XLSX', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'مسار واحد لكل تشغيل');
  test.setTimeout(300_000);
  const title = `تقرير الشفافية ${randomUUID().slice(0, 6)}`;

  const president = await accountPage(browser, `رئيس-${title.slice(-6)}`, 'council_president');
  await president.goto('/admin/reports');
  await expect(president.getByRole('heading', { name: 'التقارير والمؤشرات' })).toBeVisible({ timeout: 45_000 });

  // 1) توليد لقطة
  await president.getByLabel('عنوان التقرير').fill(title);
  await president.getByLabel('نوع الفترة').selectOption('CUSTOM');
  await president.getByRole('button', { name: 'توليد التقرير' }).click();
  await expect(president.getByText('وُلّد التقرير بلقطة ثابتة')).toBeVisible({ timeout: 45_000 });

  // 2) مراجعة ثم نشر
  await president.getByRole('link', { name: title }).click();
  await expect(president.getByRole('heading', { name: title })).toBeVisible({ timeout: 45_000 });
  await president.getByRole('button', { name: 'نشر في صفحة الشفافية' }).click();
  await expect(president.getByText('نُشر التقرير ويظهر الآن في صفحة الشفافية')).toBeVisible({ timeout: 45_000 });

  // 3) زائر بلا دخول يراه (AC-15 ③)
  const visitor = await visitorPage(browser);
  await visitor.goto('/transparency');
  await visitor.getByRole('link', { name: title }).first().click();
  await expect(visitor.getByRole('heading', { name: title })).toBeVisible({ timeout: 45_000 });
  await expect(visitor.getByText('لقطة محفوظة وقت إعداد التقرير')).toBeVisible();

  // 4) تنزيل XLSX من المراجعة — يُولَّد على الخادم ويصل مباشرة
  await president.reload();
  const [download] = await Promise.all([president.waitForEvent('download', { timeout: 60_000 }), president.getByRole('button', { name: 'XLSX' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^report-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.xlsx$/);
  const bytes = await (await download.createReadStream()).toArray();
  // ملف XLSX حاوية ZIP تبدأ بـ PK
  expect(Buffer.concat(bytes).subarray(0, 2).toString()).toBe('PK');
});

test('البوت: بلا إجابة ← استفسار ← رد + FAQ ← البوت يجده في المحاولة التالية', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'مسار واحد لكل تشغيل');
  test.setTimeout(300_000);
  // رموز فريدة لكل تشغيل: سؤال تشغيل سابق أُضيف إلى FAQ لا يطابق سؤال هذا التشغيل
  const tag = () => randomUUID().slice(0, 6);
  const [a, b, c] = [tag(), tag(), tag()];
  const question = `استفسار ${a} عن ${b} و ${c}`;
  const answer = `الرد المعتمد على ${a}: راجع لجنة الشباب.`;

  // 1) زائر يسأل ← «لم أجد» ← يرسل للفريق
  const visitor = await visitorPage(browser);
  await visitor.goto('/help');
  await visitor.getByLabel('اسأل عن المجلس والمنصة').fill(question);
  await visitor.getByRole('button', { name: 'اسأل' }).click();
  await expect(visitor.getByText('لم أجد إجابة معتمدة لسؤالك')).toBeVisible({ timeout: 45_000 });
  await visitor.getByLabel('وسيلة للتواصل معك (اختياري)').fill('visitor@example.test');
  await visitor.getByRole('button', { name: 'أرسل لفريق المجلس' }).click();
  await expect(visitor.getByText('أُرسل استفسارك لفريق المجلس')).toBeVisible({ timeout: 45_000 });

  // 2) أمين السر يجده في «أسئلة بلا إجابة» ويرد مع التحويل إلى FAQ
  const secretary = await accountPage(browser, `أمين-سر-${a}`, 'secretary');
  await secretary.goto('/admin/support');
  await secretary.getByRole('link', { name: question }).first().click();
  // يظهر في «أسئلة بلا إجابة» وفي جدول الاستفسارات معًا — ننتظر صفحة الاستفسار نفسها
  await expect(secretary).toHaveURL(/\/admin\/support\?inquiry=/, { timeout: 45_000 });
  await expect(secretary.getByRole('heading', { name: 'استفسار', exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(secretary.getByText('لم يجد له البوت أي سؤال معتمد قريب')).toBeVisible();
  await secretary.getByLabel('الرد', { exact: true }).fill(answer);
  await secretary.getByLabel('أضف هذا الرد سؤالًا معتمدًا يجده البوت').check();
  await secretary.getByLabel('التصنيف').selectOption({ label: 'عن المجلس' });
  await secretary.getByLabel('كلمات مفتاحية').fill(a);
  await secretary.getByRole('button', { name: 'إرسال الرد' }).click();
  await expect(secretary.getByText('أُرسل الرد وأُضيف إلى الأسئلة الشائعة')).toBeVisible({ timeout: 45_000 });

  // 3) المحاولة التالية: البوت يعرض الإجابة المعتمدة نفسها
  const next = await visitorPage(browser);
  await next.goto('/help');
  await next.getByLabel('اسأل عن المجلس والمنصة').fill(`ماذا عن ${a}؟`);
  await next.getByRole('button', { name: 'اسأل' }).click();
  // نتيجة البوت (مفتوحة) — والسؤال نفسه صار أيضًا في قائمة الأسئلة الشائعة أسفل الصفحة (مطويًا)
  await expect(next.locator('details[open]').getByText(answer)).toBeVisible({ timeout: 45_000 });
  await expect(next.locator('details:not([open])').getByText(answer)).toHaveCount(1);
  await expect(next.getByText('هل أفادتك الإجابة؟')).toBeVisible();
});
