import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { config } from 'dotenv';

/**
 * معيار إنجاز Sprint 1 (PRD §15): شكوى مجهولة تُتابَع برمزها حتى الإغلاق، ولا تُفتح بتخمين الرقم.
 * + AC-17: مسودة بلا اتصال تُرسل عند عودته فتصدر شكوى واحدة.
 * يتطلب Supabase محليًا وبذرة التطوير (التصنيفات). الحسابات تُنشأ بواجهة Supabase الإدارية
 * لا بـ /register، فلا تستهلك حد التسجيل (5/ساعة لكل IP) الذي يستهلكه sprint0.spec.
 */
config({ path: '.env.local' });

const PASSWORD = 'Rafah2026test';

// المسار يستهلك حدود IP على /track وشكوى الزائر؛ يكفي تشغيله في مشروع واحد
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'مسار واحد لكل تشغيل — حدود المعدل على IP (§6.4)');
});

async function createAccount(fullName: string): Promise<string> {
  const email = `${fullName.split(' ')[0]}-${randomUUID().slice(0, 6)}@example.test`.replace(/[^\w@.-]/g, 'u');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY مطلوبان في .env.local');
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName } }),
  });
  if (!res.ok) throw new Error(`admin createUser ${res.status}: ${await res.text()}`);
  return email;
}

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني أو رقم الجوّال').fill(email);
  await page.getByLabel('كلمة المرور').fill(PASSWORD);
  await page.getByRole('button', { name: 'دخول' }).click();
  await expect(page).toHaveURL(/\/(me|admin)/);
}

/** حساب بدور داخلي: الدخول الأول يربطه بسجل User، ثم يُمنح الدور، والصلاحيات تُقرأ في الطلب التالي */
async function staff(browser: Browser, name: string, grant: string): Promise<Page> {
  const email = await createAccount(name);
  const page = await (await browser.newContext({ locale: 'ar' })).newPage();
  await login(page, email);
  execSync(`npm run admin:grant -- ${email} ${grant}`, { stdio: 'pipe' });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'لوحة المجلس' })).toBeVisible();
  return page;
}

/**
 * صندوق الوارد مرتّب الأقدم أولًا بصفحات من 25 (لا تنتظر شكوى أطول من غيرها)، وقاعدة الاختبار المحلية تتراكم فيها
 * شكاوى التشغيلات السابقة — فالشكوى الجديدة قد تكون في صفحة لاحقة. نتنقّل بين الصفحات حتى نجدها.
 */
async function openFromInbox(page: Page, title: string, reference: string) {
  for (let n = 1; n <= 40; n++) {
    await page.goto(`/admin/inbox?page=${n}`);
    const link = page.getByRole('link', { name: title }).filter({ hasText: reference });
    if ((await link.count()) > 0) return link.click();
    if ((await page.getByRole('link', { name: 'التالية' }).count()) === 0) break;
  }
  throw new Error(`لم تظهر الشكوى ${reference} في أي صفحة من صندوق الوارد`);
}

async function trackStatus(page: Page, reference: string, code: string) {
  await page.goto(`/track?ref=${reference}`);
  await page.getByLabel('رمز المتابعة').fill(code);
  await page.getByRole('button', { name: 'تتبّع' }).click();
}

async function setStatus(page: Page, status: string, note: string, isPublic: boolean) {
  await page.getByLabel('الحالة التالية').selectOption({ label: status });
  await page.getByLabel('ملاحظة', { exact: true }).fill(note);
  if (isPublic) await page.getByLabel('ملاحظة عامة يراها مقدّم الشكوى في صفحة التتبّع').check();
  await page.getByRole('button', { name: 'حفظ الحالة' }).click();
  await expect(page.getByText(`الحالة الآن: ${status}.`)).toBeVisible();
}

test('شكوى زائر مجهولة ← فرز ← تحويل ← حل ← إغلاق، متابعة بالرمز في كل خطوة', async ({ page, browser }) => {
  // ثلاثة مستخدمين وعشر صفحات إدارة تُترجم أول مرة في خادم التطوير
  test.setTimeout(240_000);
  // 1) الزائر يقدّم شكوى مجهولة بلا حساب
  await page.goto('/complaints/public-new');
  await page.getByLabel('عنوان الشكوى').fill('انقطاع الإنارة في شارع تجريبي');
  await page.getByLabel('التصنيف').selectOption({ label: 'الخدمات البلدية والبنية التحتية' });
  await page.getByLabel('التفاصيل').fill('الإنارة معطلة منذ أسبوعين في الشارع الرئيسي، والمكان مظلم تمامًا ليلًا.');
  await page.getByLabel('شكوى مجهولة بلا بيانات تواصل').check();
  await page.getByRole('button', { name: 'إرسال الشكوى' }).click();

  const reference = (await page.getByTestId('complaint-reference').textContent())!.trim();
  const code = (await page.getByTestId('complaint-access-code').textContent())!.trim();
  expect(reference).toMatch(/^RF-CMP-\d{4}-\d{6}$/);
  expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  await expect(page.getByText('احفظ الرمز — لن يظهر مجددًا')).toBeVisible();

  // 2) الرقم وحده لا يفتح الشكوى (معيار الإنجاز)، والرقم مع رمزه يفتحها
  await trackStatus(page, reference, 'AAAA-AAAA');
  await expect(page.getByText('لم نجد شكوى بهذا الرقم وهذا الرمز معًا')).toBeVisible();
  await trackStatus(page, reference, code);
  await expect(page.getByText('مُستلمة').first()).toBeVisible();

  // 3) رئيس المجلس يفرز ويحوّل إلى لجنة الدعم اللوجستي
  const president = await staff(browser, 'رئيس-تجريبي', 'council_president');
  const head = await staff(browser, 'رئيس-لجنة-تجريبي', 'committee_head logistical-support');

  await openFromInbox(president, 'انقطاع الإنارة في شارع تجريبي', reference);
  await president.waitForURL(/\/admin\/complaints\/[0-9a-f-]{36}$/);
  const complaintUrl = president.url();
  await president.getByRole('button', { name: 'فتح للفرز' }).click();
  await expect(president.getByText('فُتحت الشكوى للفرز')).toBeVisible();
  await president.getByLabel('اللجنة', { exact: true }).selectOption({ label: 'لجنة الدعم اللوجستي' });
  await president.getByLabel('تعليق التحويل (داخلي)').fill('تعليق داخلي للجنة: تواصلوا مع قسم الإنارة');
  await president.getByRole('button', { name: 'تحويل', exact: true }).click();
  // نص نتيجة الإجراء — لا نص حدث المسار الذي يشبهه
  await expect(president.getByText('وأُشعر رئيس اللجنة')).toBeVisible();

  await trackStatus(page, reference, code);
  await expect(page.getByText('لجنة الدعم اللوجستي').first()).toBeVisible();
  await expect(page.getByText('محوّلة للجنة').first()).toBeVisible();
  await expect(page.getByText('تعليق داخلي للجنة')).toHaveCount(0);

  // 4) رئيس اللجنة: إشعار بالتحويل، ثم دراسة ← معالجة (ملاحظة داخلية) ← حل
  await head.goto('/me/notifications');
  await expect(head.getByText(`شكوى جديدة للجنة: ${reference}`)).toBeVisible();
  await head.goto(complaintUrl);
  await setStatus(head, 'تدرسها اللجنة', 'اللجنة استلمت الشكوى وتدرسها.', true);
  await setStatus(head, 'قيد المعالجة', 'ملاحظة داخلية: الموظف المسؤول في إجازة', false);
  await setStatus(head, 'حُلّت', 'أُصلحت الإنارة في الشارع كله.', true);

  await trackStatus(page, reference, code);
  await expect(page.getByText('أُصلحت الإنارة في الشارع كله.')).toBeVisible();
  await expect(page.getByText('الموظف المسؤول في إجازة')).toHaveCount(0);

  // 5) الإغلاق
  await president.goto(complaintUrl);
  await president.getByRole('button', { name: 'إغلاق الشكوى' }).click();
  await expect(president.getByText('أُغلقت الشكوى.', { exact: true })).toBeVisible();

  await trackStatus(page, reference, code);
  await expect(page.getByText('مغلقة').first()).toBeVisible();
});

test('AC-17: المسودة تبقى بعد إعادة الفتح، وتُرسل عند عودة الاتصال فتصدر شكوى واحدة', async ({ page, context }) => {
  const email = await createAccount('شاب-تجريبي');
  await login(page, email);
  await page.goto('/me/complaints/new');

  await page.getByLabel('عنوان الشكوى').fill('ملعب الحي مغلق منذ شهر');
  await page.getByLabel('التصنيف').selectOption({ label: 'الرياضة والفنون' });
  await page.getByLabel('التفاصيل').fill('الملعب الوحيد في المنطقة مغلق منذ شهر دون إعلان موعد لإعادة فتحه.');
  await expect(page.getByText('المسودة محفوظة على هذا الجهاز فقط')).toBeVisible();

  // ④ إغلاق الصفحة وفتحها لا يفقد المسودة
  await page.reload();
  await expect(page.getByLabel('عنوان الشكوى')).toHaveValue('ملعب الحي مغلق منذ شهر');

  // ① بلا اتصال: رسالة واضحة، ولا رقم قبل الإرسال الفعلي
  await context.setOffline(true);
  await page.getByRole('button', { name: 'إرسال الشكوى' }).click();
  await expect(page.getByText('محفوظة على جهازك — سترسَل عند عودة الاتصال')).toBeVisible();
  await expect(page.getByTestId('complaint-reference')).toHaveCount(0);

  // ③ عودة الاتصال ⇒ إرسال تلقائي والرقم يظهر
  await context.setOffline(false);
  await expect(page.getByTestId('complaint-reference')).toBeVisible({ timeout: 30_000 });
  const reference = (await page.getByTestId('complaint-reference').textContent())!.trim();

  // ② شكوى واحدة فقط بهذا العنوان في «شكاواي»
  await page.goto('/me/complaints');
  await expect(page.getByRole('link', { name: /ملعب الحي مغلق منذ شهر/ })).toHaveCount(1);
  await expect(page.getByText(reference)).toBeVisible();
});
