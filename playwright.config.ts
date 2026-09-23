import { defineConfig, devices } from '@playwright/test';

// يتطلب Supabase محليًا: npx supabase start ثم .env.local مضبوط (انظر .env.example)
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  // المشروعان يتشاركان خادم تطوير واحدًا وقاعدة Supabase محلية واحدة — التوازي يبطئ Auth حتى تتجاوز المهلة
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // خادم التطوير يترجم الصفحات عند الطلب، والمشروعان يعملان بالتوازي عليه — 5 ثوانٍ الافتراضية لا تكفي للتسجيل ثم التحويل
  expect: { timeout: 15_000 },
  // مسار Sprint 0 يسجّل حسابين ويشغّل admin:grant ثم يدخل — يتجاوز 30 ثانية الافتراضية
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'ar',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile-360', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 780 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/login',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
