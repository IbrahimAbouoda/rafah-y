import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import { headers } from 'next/headers';
import { ThemeProvider } from 'next-themes';
import { DemoBadge } from '@/components/shared/demo-badge';
import { ServiceWorkerRegister } from '@/components/shared/sw-register';
import './globals.css';

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'نبض رفح | منصة الشباب', template: '%s · نبض رفح' },
  description: 'صوت الشباب... فكرة تتحول إلى أثر — منصة المجلس البلدي الشبابي في رفح',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0b5c4b' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1412' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // nonce من proxy.ts لسكربت الوضع الداكن المضمَّن (CSP §6.10)
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="ar" dir="rtl" className={arabic.variable} suppressHydrationWarning>
      <body className="min-h-dvh">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce}>
          <DemoBadge />
          {children}
          <ServiceWorkerRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
