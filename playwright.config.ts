import { defineConfig, devices } from '@playwright/test';

// يتطلب Supabase محليًا: npx supabase start ثم .env.local مضبوط (انظر .env.example)
//
// الخادم: بناء إنتاج على منفذ مخصص (3100) يبدؤه Playwright بنفسه ويوقفه بعد التشغيل.
// · خادم التطوير يترجم الصفحات عند الطلب: قد يعيد 404 لمسار موجود في أول ترجمة، وتوقّف Turbopack أثناء التشغيل الكامل
//   أكثر من مرة — فتسقط الاختبارات بـ ERR_CONNECTION_REFUSED لا بخطأ في المنطق.
// · reuseExistingServer=false: لا يلتقط أي خادم آخر يعمل على المنفذ (npm run dev للتطوير يبقى على 3000 بلا تعارض).
// · E2E_SERVER=dev npx playwright test … لتكرار سريع على خادم تطوير بالمنفذ نفسه — ليس للتحقق النهائي.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
const useDev = process.env.E2E_SERVER === 'dev';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  // المشروعان يتشاركان خادمًا واحدًا وقاعدة Supabase محلية واحدة — التوازي يبطئ Auth حتى تتجاوز المهلة
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // التسجيل ثم التحويل عبر Supabase Auth المحلي يتجاوز 5 ثوانٍ الافتراضية
  expect: { timeout: 15_000 },
  // مسار Sprint 0 يسجّل حسابين ويشغّل admin:grant ثم يدخل — يتجاوز 30 ثانية الافتراضية
  timeout: 90_000,
  use: {
    baseURL,
    locale: 'ar',
    trace: 'retain-on-failure',
    // Service Worker يُسجَّل في الإنتاج فقط: يُحجب ليبقى السلوك كما في التطوير، ولا تُخدم صفحة محفوظة بدل الحالية
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'mobile-360', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 780 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: useDev ? `npx next dev -p ${PORT}` : `npm run build && npx next start -p ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    // البناء (~1.5 دقيقة) ثم التشغيل
    timeout: 300_000,
    env: {
      // بناء إنتاج محلي بلا Upstash (lib/rate-limit.ts يسمح بها صراحةً لهذا فقط)
      RATE_LIMIT_STORE: 'memory',
      // روابط البريد تشير إلى خادم الاختبار نفسه، وشارة «بيئة تجريبية» تبقى كما في التطوير
      APP_URL: baseURL,
      APP_ENV: 'staging',
    },
  },
});
