import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../lib/generated/prisma/client';

/**
 * معيار إنجاز Sprint 0 (PRD §15) عبر المتصفح:
 * مستخدم يسجّل ← الرئيس يعيّنه عضو لجنة ← الإجراء في سجل التدقيق.
 * يتطلب Supabase محليًا مع enable_confirmations = false (الافتراضي في supabase/config.toml).
 */

const PASSWORD = 'Rafah2026test';

async function register(page: Page, name: string, email: string) {
  await page.goto('/register');
  await page.getByLabel('الاسم الكامل').fill(name);
  await page.getByLabel('البريد الإلكتروني').fill(email);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(PASSWORD);
  await page.getByLabel('تأكيد كلمة المرور').fill(PASSWORD);
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
  // Sprint 1: التسجيل يهبط في بوابة الشباب /me
  await expect(page.getByRole('heading', { name: `أهلًا ${name}` })).toBeVisible();
  await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
}

test('تسجيل ← تعيين عضو لجنة ← سجل التدقيق', async ({ page }) => {
  const tag = randomUUID().slice(0, 6);
  const presidentEmail = `president-${tag}@example.test`;
  const memberEmail = `member-${tag}@example.test`;
  const memberName = `عضو تجريبي ${tag}`;

  await register(page, `رئيس تجريبي ${tag}`, presidentEmail);
  await register(page, memberName, memberEmail);
  execSync(`npm run admin:grant -- ${presidentEmail} council_president`, { stdio: 'pipe' });

  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني أو رقم الجوّال').fill(presidentEmail);
  await page.getByLabel('كلمة المرور').fill(PASSWORD);
  await page.getByRole('button', { name: 'دخول' }).click();
  // Sprint 1: الدور الداخلي يهبط في لوحة المجلس /admin، ومنها إلى إدارة المستخدمين
  // أول طلب لـ /admin في خادم تطوير جديد يترجم اللوحة كاملة
  await expect(page).toHaveURL(/\/admin$/, { timeout: 45_000 });
  await page.goto('/admin/settings/users');

  await page.getByRole('searchbox').or(page.getByPlaceholder('ابحث بالاسم أو البريد أو الهاتف')).fill(memberEmail);
  await page.getByRole('button', { name: 'بحث' }).click();
  await page.getByRole('link', { name: memberName }).click();

  await page.getByLabel('الدور').selectOption({ label: 'عضو اللجنة' });
  await page.getByLabel('اللجنة').selectOption({ label: 'لجنة الأنشطة والمبادرات' });
  await page.getByRole('button', { name: 'تعيين' }).click();
  await expect(page.getByText(`عُيّن دور «عضو اللجنة» للمستخدم ${memberName}`)).toBeVisible();

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
  try {
    const member = await db.user.findFirstOrThrow({ where: { email: memberEmail } });
    const assignment = await db.roleAssignment.findFirstOrThrow({ where: { userId: member.id, role: { key: 'committee_member' } } });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'role.assign', entityId: assignment.id } });
    // كل حساب جديد يحمل دور youth تلقائيًا، فالمهم أن الإجراء منسوب لرئاسة المجلس
    expect(audit.actorRoles).toContain('council_president');
  } finally {
    await db.$disconnect();
  }
});

test('غير المسجّل يُحوَّل لتسجيل الدخول، والصفحة تعمل على 360px بلا تمرير أفقي', async ({ page }) => {
  await page.goto('/admin/settings/users');
  await expect(page).toHaveURL(/\/login\?next=/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});
