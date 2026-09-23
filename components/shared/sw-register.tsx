'use client';

import { useEffect } from 'react';

// تسجيل Service Worker في البناء الإنتاجي فقط: في التطوير يحفظ أصولًا قديمة فيربك إعادة التحميل الساخن.
// المسودات (IndexedDB) تعمل بدونه في كل البيئات؛ هو يضيف فتح صفحة النموذج بلا اتصال (§7.1).
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);
  return null;
}
