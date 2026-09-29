import type { NextConfig } from 'next';

// رؤوس الأمان — PRD §6.10
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // مكتبات التصدير (S5-2 · S5-3) تعمل على الخادم فقط وتقرأ ملفات بياناتها وقت التشغيل — لا تُحزَم
  serverExternalPackages: ['pg', '@prisma/adapter-pg', 'pdfmake', 'pdfkit', 'fontkit', 'exceljs'],
  // خط PDF التقرير يُقرأ من القرص (lib/pdf/report-pdf.ts) — يُضمَّن في مخرجات الخادم للصفحة التي تستدعي التصدير
  outputFileTracingIncludes: { '/admin/reports': ['./lib/pdf/fonts/**'] },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
