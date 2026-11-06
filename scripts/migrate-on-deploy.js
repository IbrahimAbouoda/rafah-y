// يطبّق migrations المعلّقة على قاعدة الإنتاج قبل بناء Vercel — كي لا يُنشر كود يقرأ أعمدة غير موجودة.
// الإنتاج فقط: بناء المعاينة (فرع أو PR) لا يلمس القاعدة، فلا تصل migration غير مراجَعة إلى الإنتاج.
// يُستدعى من "vercel-build" في package.json؛ Vercel يفضّله على "build" تلقائيًا.
import { execSync } from 'node:child_process';

const env = process.env.VERCEL_ENV;

if (env !== 'production') {
  process.stdout.write(`migrate-on-deploy: VERCEL_ENV=${env ?? 'unset'} — لا تطبيق للـ migrations خارج الإنتاج\n`);
  process.exit(0);
}

if (!process.env.DIRECT_URL) {
  process.stderr.write('migrate-on-deploy: DIRECT_URL غير مضبوط في متغيرات Vercel للإنتاج — أضفه (اتصال مباشر، منفذ 5432) ثم أعد النشر\n');
  process.exit(1);
}

execSync('npx prisma migrate deploy', { stdio: 'inherit' });
