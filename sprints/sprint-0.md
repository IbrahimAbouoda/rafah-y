# Sprint 0 — الأساس

| | |
| --- | --- |
| **الأسابيع** | 1–2 |
| **الهدف** | مشروع يعمل بمصادقة وصلاحيات وتدقيق ونشر تجريبي |
| **معيار الإنجاز** | مستخدم يسجّل، الرئيس يعيّنه عضو لجنة، والإجراء يظهر في سجل التدقيق |
| **الحالة** | قيد التنفيذ (بدأ 2026-09-23) |

## الأسئلة (PRD §18)

| # | الحالة |
| --- | --- |
| Q1 | مفتوح — يؤثر على الجدول الزمني لا على الكود |
| Q2 · Q3 | مُجاب: المصفوفة كما هي |
| Q5 | دورة تجريبية في بذرة التطوير؛ الحقيقية من `/admin/settings/terms` |
| Q14 | التطوير محليًا؛ الاستضافة قبل أول نشر تجريبي |

## الاعتماديات

- `prisma/schema.prisma` و `prisma/rbac.seed.ts` و `sql/constraints.sql` — معتمدة (PRD §19.3).
- اللجان التسع — PRD §4.3.
- **النشر التجريبي** (جزء من هدف السبرنت) ينتظر قرار الاستضافة في Q14.

## قاعدة البيانات

- أول migration من `schema.prisma` كاملًا (59 نموذجًا).
- migration يدوية ثانية تحتوي `sql/constraints.sql` كما هو.
- `prisma/seed.ts`: يستدعي `seedRbac()` + اللجان + `CouncilTerm` الحالية + المناطق والتصنيفات (إن توفرت).
- التحقق على قاعدة حقيقية أن `prisma migrate dev` لا يرى الفهرس الجزئي `council_terms_one_current` كانحراف (drift).

## البنية

| الملف | المحتوى |
| --- | --- |
| `package.json` | Next.js 14+ · TypeScript · Tailwind · shadcn/ui · Prisma 7.10 · `@prisma/adapter-pg` · Supabase · Zod · Vitest · Playwright |
| `lib/db.ts` | عميل Prisma عبر `@prisma/adapter-pg` + `$extends` للحذف الناعم |
| `lib/rbac.ts` | `can(user, key, { committeeId, ownerId })` بآلية §3.2 |
| `lib/audit.ts` | `writeAudit(tx, user, action, entityType, entityId, before, after)` مع لقطة الأدوار |
| `lib/sequence.ts` | `nextRef(tx, key)` تغلّف `next_ref()` |
| `lib/crypto.ts` | AES-256-GCM لبيانات التواصل (تُستخدم في Sprint 1) |
| `proxy.ts` | فحص تسجيل الدخول فقط (§6.2) — Next.js 16 أعاد تسمية middleware |
| `next.config` | رؤوس §6.10 |
| `tailwind.config` | tokens الألوان من §12 + الوضع الداكن |

## المسارات (PRD §11.2)

| المسار | الصلاحية |
| --- | --- |
| `/login` | — |
| `/register` | — |
| `/reset-password` | — |
| `/admin/settings/users` | `users:manage_roles` |
| `/admin/settings/roles` | `users:manage_roles` |
| `/admin/settings/terms` | `users:manage_roles` |
| `/admin/settings/committees` | `committees:manage` |
| `/admin/settings/categories` | `settings:manage` |
| `/admin/settings/areas` | `settings:manage` |

## المكوّنات (PRD §12)

`AppShell` (مع شارة «بيئة تجريبية») · `Sidebar` · `Header` · `PermissionGate` · `DataTable` · `StatusBadge`

## Server Actions وعمليات التدقيق (§6.9)

| Action | الصلاحية | سطر التدقيق |
| --- | --- | --- |
| `auth/register` · `auth/login` · `auth/resetPassword` | — | — |
| `roles/assignRole` | `users:manage_roles` | `role.assign` |
| `roles/revokeRole` | `users:manage_roles` | `role.revoke` |
| `terms/startTerm` | `users:manage_roles` | `term.change` |
| `committees/create` · `committees/update` | `committees:manage` | `settings.change` |
| `settings/upsertCategory` · `settings/upsertArea` | `settings:manage` | `settings.change` |

## معايير القبول

- **AC-16** — تعيين الأدوار ودورات المجلس (كامل).
- **AC-20** ③ فقط — شارة «بيئة تجريبية» في كل الصفحات خارج الإنتاج.
- أساس **AC-19**: `writeAudit()` والـ trigger يعملان؛ شاشة `/admin/audit` نفسها في Sprint 1.

## الاختبارات (§17 بند 11)

- وحدة: `can()` لكل نطاق (OWN/COMMITTEE/ALL)، دور مسحوب، دور منتهٍ، دورة غير حالية.
- وحدة: المصفوفة المزروعة = 69 صلاحية و 202 منحة وأعداد كل دور.
- تكامل: `assignRole` يرفض دورًا `requiresCommittee` بلا لجنة · مستخدم بلا `users:manage_roles` يتلقى رفضًا.
- تكامل: `UPDATE`/`DELETE` على `audit_logs` يفشل · دورتان حاليتان مرفوضتان.
- E2E: تسجيل ← الرئيس يعيّن عضو لجنة ← سطر `role.assign` موجود.

## Definition of Done

راجع PRD §17 — البنود الاثنا عشر + بوابة الجودة (`npm run check` · الاختبارات خضراء).

## سجل الإنجاز (2026-09-23)

| البند | الحالة |
| --- | --- |
| migrations: `init` (59 نموذجًا) + `constraints` (15 تعليمة) — بلا انحراف مع المخطط | ✅ |
| `lib/`: `can()` · `loadSessionUser()` · `writeAudit()` · `nextRef()` · `crypto` · حد المعدل · `runAction()` | ✅ |
| `proxy.ts`: CSP بـ nonce · تجديد الجلسة · فحص خشن للدخول | ✅ |
| المسارات التسعة في الجدول أعلاه + معالج رابط الاستعادة `/reset-password/confirm` | ✅ |
| المكوّنات: AppShell · Sidebar · Header · PermissionGate · DataTable · StatusBadge · شارة البيئة التجريبية | ✅ |
| Server Actions الموثّقة أعلاه مع سطور التدقيق | ✅ |
| `prisma/seed.ts` (المصفوفة · اللجان التسع · دورة تجريبية) · `npm run admin:grant` | ✅ |
| Vitest: 52 وحدة + 40 تكامل على PostgreSQL (PGlite) — خضراء | ✅ |
| `npm run check` · `next build` | ✅ |
| E2E (`tests/e2e/sprint0.spec.ts`) | ⏳ مكتوب — يحتاج Supabase محليًا (Docker) للتشغيل |
| النشر التجريبي | ⏳ بانتظار قرار الاستضافة (Q14) |

## Dependencies تقنية مُدخلة من خارج السبرنت

| البند | السبب |
| --- | --- |
| `lib/crypto.ts` (تشفير التواصل) | مذكور في بنية Sprint 0؛ يُستخدم في Sprint 1 — مختبَر وحدويًا فقط |
| `nextRef()` + اختبار عدم التكرار | أساس AC-01 ②④؛ لا مستهلك له في Sprint 0 |
| `scripts/grant-role.ts` | بلا مستخدم يملك `users:manage_roles` لا يمكن تعيين أي دور من الواجهة؛ الأمر يكتب سطر تدقيق بمصدر `system:cli` |
