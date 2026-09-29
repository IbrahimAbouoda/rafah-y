// Service Worker — PRD §7: هدف واحد، ألا يفقد الشاب ما كتبه حين ينقطع الاتصال.
// · صفحات النموذج والتتبّع: الشبكة أولًا، ثم آخر نسخة محفوظة عند الانقطاع (لتُفتح الصفحة وتُكمل المسودة من IndexedDB).
// · الأصول الثابتة المُجزّأة (/_next/static): المحفوظ أولًا — أسماؤها تتغيّر مع كل بناء.
// · لا يُحفظ أي طلب بيانات ولا Server Action ولا صفحة إدارة (§7.2).
const PAGES = 'rafah-pages-v2';
const ASSETS = 'rafah-assets-v1';
// §7.1: صفحات النموذج والتتبّع، و«قراءة آخر صفحة زارها» للرئيسية وكيف تعمل المنصة و FAQ
const OFFLINE_PAGES = ['/complaints/public-new', '/me/complaints/new', '/track', '/', '/how-it-works', '/help'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== PAGES && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode !== 'navigate') return;

  // الخروج ينتهي في /login: تُمسح الصفحات المحفوظة فلا يرى المستخدم التالي على الجهاز نفسه صفحة غيره
  if (url.pathname === '/login') {
    event.waitUntil(caches.delete(PAGES));
    return;
  }

  if (!OFFLINE_PAGES.includes(url.pathname)) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && !res.redirected) {
          const copy = res.clone();
          caches.open(PAGES).then((cache) => cache.put(url.pathname, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(url.pathname)) ?? Response.error()),
  );
});
