# نبض رفح | منصة الشباب — قواعد المشروع

> يُقرأ هذا الملف تلقائيًا في كل جلسة. المرجع الكامل `PRD.md`، وملف العمل اليومي `sprints/sprint-<N>.md`.

## المشروع

منصة رقمية لـ«المجلس الشبابي البلدي - رفح»: شكاوى الشباب وأفكارهم ومبادراتهم تدخل بمسار موثّق، تعمل عليها تسع لجان، وتصل احتياجاتها للمؤسسات الداعمة مرقّمة، وتُنشر نتائجها للعامة. عربية RTL، جوّال أولًا، اتصال غير مضمون.

## المكدّس

| | |
| --- | --- |
| الإطار | Next.js 16 App Router · React 19 · TypeScript 5.9 · Server Actions |
| الواجهة | Tailwind 4 (tokens في `app/globals.css`) · مكوّنات بنمط shadcn/ui · RTL · وضع داكن |
| البيانات | PostgreSQL على Supabase · **Prisma 7.10** |
| المصادقة | Supabase Auth (بريد أو هاتف + كلمة مرور) |
| التخزين | Supabase Storage — خاص افتراضيًا، روابط موقّعة |
| الاختبارات | Vitest للوحدة والتكامل (PGlite) · Playwright للمسارات (يحتاج Supabase محليًا) |

**انتبه لتغييرات Next.js 16:** `middleware.ts` صار `proxy.ts` (الدالة `proxy`) · `cookies()` و `headers()` و `searchParams` كلها async.

**انتبه لتغييرات Prisma 7:** المولّد `prisma-client` (لا `prisma-client-js`) · روابط الاتصال في `prisma.config.ts` لا في `schema.prisma` · العميل يعمل عبر `@prisma/adapter-pg` · الحذف الناعم عبر `$extends` لا عبر middleware.

## قبل أن تكتب سطرًا

1. اقرأ ملف السبرنت الحالي كاملًا.
2. راجع في `PRD.md`: §3 الصلاحيات · §4 قاعدة البيانات · §6 الأمن · §14 معيار قبول الميزة.
3. إن لم تجد المواصفة: **توقّف واسأل**. لا تخمّن ولا تخترع.

## بنية المجلدات

```
app/(public)  app/(auth)  app/me  app/partner  app/admin
components/ui        — primitives بنمط shadcn
components/shared    — AppShell · PermissionGate · StatusBadge · DataTable · ActionForm …
lib/rbac.ts          — can() · buildGrants()
lib/session.ts       — loadSessionUser() · activeAssignmentsWhere()
lib/auth.ts          — requireUser() · requirePermission() · provisionUser()
lib/page-guard.ts    — guardPage() لكل صفحة محمية
lib/action.ts        — runAction(): كل خطأ ← رسالة عربية
lib/audit.ts         — writeAudit()
lib/sequence.ts      — nextRef()
lib/crypto.ts        — تشفير بيانات التواصل
lib/rate-limit.ts    — LRU محليًا · Upstash في الإنتاج
lib/nav.ts           — عناصر التنقل من الصلاحيات
server/actions/<domain>/*.ts
proxy.ts             — CSP + تجديد الجلسة + فحص خشن للدخول فقط
prisma/schema.prisma · prisma/rbac.seed.ts · prisma/seed.ts · prisma/migrations/
tests/unit · tests/integration · tests/e2e
```

## قالب Server Action — لا استثناء

```ts
'use server';
export async function updateComplaintStatus(input: unknown) {
  const user = await requireUser();                              // 1) الهوية
  await requirePermission(user, 'complaints:update_status');     //    + الصلاحية بأي نطاق — الرفض قبل لمس المدخلات
  const data = UpdateStatusSchema.parse(input);                  // 2) التحقق
  const complaint = await db.complaint.findUniqueOrThrow({ where: { id: data.id } });
  await requirePermission(user, 'complaints:update_status', {    // 3) المنطق: الصلاحية بنطاق السجل الفعلي
    committeeId: complaint.committeeId,
  });
  return db.$transaction(async (tx) => {                         //    التغيير
    const updated = await tx.complaint.update({ /* … */ });
    await tx.complaintEvent.create({ /* … */ });
    await writeAudit(tx, user, 'complaint.status_change',        // 4) التدقيق في نفس المعاملة
      'Complaint', updated.id, complaint, updated);
    return updated;
  });
}
```

الاستثناء الوحيد من الخطوة 1: شكوى الزائر في `/complaints/public-new` — بلا مستخدم، فيحلّ محلّ الصلاحية حدُّ معدل مشدّد و `submitterId = NULL`.

## ممنوع (يُرفض في المراجعة)

- `role === 'council_president'` أو أي مقارنة باسم دور أو معرّف مستخدم — الصلاحية من `can()` فقط.
- الاعتماد على `PermissionGate` للحماية — هو إخفاء بصري لا أكثر.
- `ml-` `mr-` `pl-` `pr-` `left:` `right:` — خصائص منطقية فقط (`ms-` `me-` `ps-` `pe-`).
- بيانات ثابتة داخل المكوّنات، أو `isDemo` غير مُعلَّمة، أو بيانات حقيقية في بيئة التطوير.
- زر بلا إجراء، أو صفحة بمسار غير موجود في PRD §11.2.
- توليد رقم مرجعي خارج `nextRef()`، أو كتابة المبلغ المؤمَّن في حقل يدوي.
- إرسال Concept Note أو بيان رسمي بلا موافقة بشرية مسجَّلة.
- `any` بلا تعليق يبرّرها · `console.log` متروك · migration معدَّلة بعد نشرها.

## مطلوب دائمًا

- ثلاث حالات لكل شاشة: فارغ، تحميل، خطأ.
- رسائل خطأ عربية تقول ما الخطأ وكيف يُصلَح.
- كل عملية حساسة (PRD §6.9) تكتب سطرًا في `AuditLog` داخل نفس المعاملة.
- كل ميزة باختباراتها: منطق الصلاحيات، رفض غير المخوَّل، والمسار السعيد.
- عمل ضمن السبرنت الحالي فقط — إلا Dependency تقنية تُوثَّق في ملف السبرنت.

## الأوامر

```bash
npm run dev
npx prisma migrate dev --name <وصف>   # لا تعدّل migration منشورة
npx prisma generate
npx prisma db seed
npm run admin:grant -- <email> council_president   # أول دور إداري فقط
npm run test        # Vitest
npm run test:e2e    # Playwright
npm run check       # tsc + lint + prisma validate
```

## حالة المشروع

**السبرنت الحالي:** 5 — **مكتمل وجاهز للمراجعة النهائية (2026-09-28، الفرع `sprint-5`)**: كل المحاور الخمسة منفّذة، و `npm run check` و `npm run test` و `npm run test:e2e` تمر كاملة. Sprints 0–5 مكتملة عدا النشر التجريبي بانتظار Q14، ومحتوى ينتظر المجلس: أهداف المؤشرات (Q10) ونصوص إجابات FAQ المبدئية (Q11). `PRD.md` v1.1 معتمد، والقرارات في §19.3 (D1–D40).

**ثوابت يسهل نسيانها:**
- الأرقام المرجعية: `next_ref('CMP-2026')` → `RF-CMP-2026-000124` · الأفكار `IDA-2026` · القرارات `next_ref('DEC-2026', 4)`. الدالة تضيف `RF-` بنفسها.
- العملة `ILS` افتراضيًا، و `USD` مسموحة.
- الاسم الرسمي والألوان (D40): `COUNCIL_NAME_AR` / `COUNCIL_NAME_EN` من `lib/config.ts` — لا تكتب الاسم نصًا في المكوّنات. الألوان عبر tokens (`brand` `accent` `alert`) أو `council-*`، لا hex في المكوّنات.
- لجنة الإعلام = slug `public-relations-media` (من إعداد، لا مقارنة اسم).
- التطوير على Supabase محلي (Docker)؛ الاختبارات التي تحتاج قاعدة بيانات تعمل على PGlite.
- المرسِل الرسمي للبريد `info.rafahyouth@gmail.com` (`COUNCIL_EMAIL` في `lib/config.ts`)؛ محليًا يلتقطه Mailpit على `http://127.0.0.1:54324`.
- المبلغ المؤمَّن من `securedTotals()` (قيود واردة معتمدة فقط)، ونطاق «خاص» للمؤسسة = أعضاؤها يُمرَّرون إلى `can()` كـ ownerId (`lib/organizations.ts`).
- انتقالات المهمة من `lib/tasks/workflow.ts` والفكرة من `lib/ideas/workflow.ts`؛ عضوية اللجنة من `lib/committees.ts` (تعيين فعّال، لا جدول).
- انتقالات الشكوى من `lib/complaints/workflow.ts` فقط، ونطاق القوائم من `readableComplaints()` — لا شروط حالة أو لجنة مكتوبة في الصفحات.
- الفرصة وطلبها من `lib/opportunities/workflow.ts`، والنشاط من `lib/activities/workflow.ts`. بيانات المتقدّم لا تُرسل مع الصفحة: `listApplicants()` بلا بيانات شخصية، والملف عبر `viewApplicantAction` بسطر `application.view` (D31). نص `ConsentDialog` = `APPLICANT_DATA_POINTS`.
- كل نشاط بلجنة (D34). المهارات قائمة مرجعية في البذرة الأساسية (D32).
- المؤشرات M1–M10 من `lib/reports/collect.ts` (منطقها الخالص في `metrics.ts`)؛ التقرير لقطة ثابتة في `Report.metrics`. التوليد بـ `reports:create` لا `reports:read` (D35)، والنشر للرئيس وحده.
- كل تصدير Server Action يولّد الملف على الخادم ويكتب سطر تدقيق (`*.export`). PDF العربي عبر `lib/pdf/arabic.ts` فقط — لا تمرّر نصًا عربيًا خامًا إلى pdfmake.
- Markdown يُعرض عبر `<Markdown>` من `lib/markdown.tsx` فقط — لا `dangerouslySetInnerHTML`.
- البوت: `lib/support/match.ts`، مفتوح للزائر بحد معدل (D36)، وكل سؤال سطر `BotQuery` بلا نص ولا هوية (D39). التعطيل بدل الحذف في FAQ (D37). إشعار المنصة لا يُوقف (D38).
- الجدولة: `/api/cron/*` عبر `cronHandler()` في `lib/cron.ts` بسرّ `CRON_SECRET`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
