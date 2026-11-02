// لقطة PDF واحدة للصفحات العامة — للمراجعة والعرض على المجلس، لا للنشر. تُلتقط من خادم يعمل فعلًا.
//
//   npm run dev            (في طرفية أخرى)
//   npm run pdf:site -- [ملف-الإخراج.pdf]      افتراضيًا exports/Rafah_Pulse_Full_Site.pdf
//
// BASE_URL لخادم آخر (افتراضيًا http://localhost:3000). المسارات من lib/public-nav.ts نفسها التي يعرضها الرأس،
// فلا تُلتقط صفحة غير موجودة. الصفحة التي تفشل تُتخطّى ويُذكر سببها، ويُحفظ الباقي.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { COMPLAINT_CTA, PUBLIC_NAV } from '../lib/public-nav';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const OUT = process.argv[2] ?? path.join('exports', 'Rafah_Pulse_Full_Site.pdf');
const ROUTES = ['/', COMPLAINT_CTA.href, ...PUBLIC_NAV.flatMap((g) => g.links.map((l) => l.href))];

// عرض سطح المكتب (1280px) بنسبة A4 — الطباعة بعرض A4 الفعلي (≈794px) تُظهر تخطيط الجوال
const PAGE = { width: 1280, height: Math.round((1280 * 297) / 210) };

async function main() {
  const reachable = await fetch(`${BASE_URL}/login`).then((r) => r.ok, () => false);
  if (!reachable) {
    console.error(`الخادم لا يستجيب على ${BASE_URL}. شغّل «npm run dev» أولًا، أو حدّد BASE_URL.`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const merged = await PDFDocument.create();
  const failed: { route: string; reason: string }[] = [];
  try {
    // بلا Service Worker: لا نسخة محفوظة قديمة بدل الصفحة الحالية
    const context = await browser.newContext({
      viewport: { width: PAGE.width, height: 900 },
      colorScheme: 'light',
      locale: 'ar',
      serviceWorkers: 'block',
    });
    for (const route of ROUTES) {
      console.log(`← ${route}`);
      const page = await context.newPage();
      try {
        // «load» لا «networkidle»: اتصال التحديث الحي في وضع التطوير لا يهدأ أبدًا. التجميع الأول بطيء، فالمهلة دقيقتان.
        const res = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'load', timeout: 120_000 });
        if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status() ?? 'بلا استجابة'}`);
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        await page.emulateMedia({ media: 'screen' });
        const pdf = await page.pdf({
          width: `${PAGE.width}px`,
          height: `${PAGE.height}px`,
          printBackground: true,
          margin: { top: '24px', bottom: '40px', left: '24px', right: '24px' },
          displayHeaderFooter: true,
          headerTemplate: '<span></span>',
          footerTemplate: `<div dir="ltr" style="width:100%;font-size:10px;color:#5d6560;padding:0 24px;display:flex;justify-content:space-between"><span>${route}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
        });
        const doc = await PDFDocument.load(pdf);
        for (const p of await merged.copyPages(doc, doc.getPageIndices())) merged.addPage(p);
      } catch (e) {
        failed.push({ route, reason: e instanceof Error ? e.message.split('\n')[0]! : String(e) });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  if (merged.getPageCount() === 0) {
    console.error('لم تُلتقط أي صفحة:', failed);
    process.exit(1);
  }
  await mkdir(path.dirname(path.resolve(OUT)), { recursive: true });
  await writeFile(OUT, await merged.save());
  console.log(`✓ ${OUT} — ${ROUTES.length - failed.length} صفحات، ${merged.getPageCount()} ورقة`);
  if (failed.length) {
    for (const f of failed) console.error(`✗ ${f.route}: ${f.reason}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
