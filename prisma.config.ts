// إعداد Prisma 7 — روابط الاتصال هنا لا في schema.prisma.
// Prisma 7 لا يحمّل .env تلقائيًا، لذلك dotenv صراحةً.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // اتصال مباشر (منفذ 5432) للـ migrations. التطبيق يتصل عبر الـ pooler
    // بـ DATABASE_URL من خلال @prisma/adapter-pg، لا من هنا.
    // ليس env() الصارمة: `prisma generate` يعمل عند التثبيت وفي CI بلا قاعدة بيانات.
    // أوامر migrate تفشل برسالة واضحة إن لم يُضبط المتغير.
    url: process.env.DIRECT_URL,
  },
});
