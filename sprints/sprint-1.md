# Sprint 1 — الشكاوى

| | |
| --- | --- |
| **الأسابيع** | 3–4 |
| **الهدف** | السلسلة الكاملة من تقديم الشكوى حتى إغلاقها |
| **معيار الإنجاز** | شكوى مجهولة تُتابَع برمزها حتى الإغلاق، ولا تُفتح بتخمين الرقم |
| **الحالة** | قيد التنفيذ (بدأ 2026-09-23) — الكود والاختبارات مكتملة؛ ينتظر النشر التجريبي (Q14) |

## الأسئلة الحاجبة (PRD §18)

| # | السؤال | ما يتوقف عليه هنا |
| --- | --- | --- |
| Q6 | ~~سياسة الاحتفاظ بالشكاوى وتجهيلها~~ **مُجاب (D18):** 5 سنوات، تجهيل بعد 3 من الإغلاق | بند الخصوصية في نموذج التقديم ✅ |
| Q8 | ~~البريد الرسمي والنطاق~~ **مُجاب مؤقتًا (D19):** `info.rafahyouth@gmail.com` عبر Gmail SMTP؛ النطاق الدائم مفتوح | إشعارات البريد ✅ · SPF/DKIM بانتظار النطاق |

## الاعتماديات

- Sprint 0 مكتمل.
- مفتاح التشفير في خزنة الأسرار (Q14).
- حد المعدل: Upstash Redis (إنتاج) / LRU (تطوير) — PRD §6.4.
- فحص الملفات: خدمة وهمية في التطوير، ClamAV في الإنتاج — PRD §6.5.

## النماذج المستخدمة (§4.5)

`Complaint` · `ComplaintContact` · `ComplaintEvent` · `ComplaintReferral` · `ComplaintCategory` · `Area` · `FileObject` · `Notification` · `NotificationPreference` · `Counter` · `AuditLog`

## المسارات (PRD §11.2)

| المسار | الصلاحية |
| --- | --- |
| `/track` | — |
| `/complaints/public-new` | — (حد معدل مشدّد) |
| `/me` | تسجيل دخول |
| `/me/complaints` | `complaints:read`(خاص) |
| `/me/complaints/new` | `complaints:create` |
| `/me/complaints/[ref]` | `complaints:read`(خاص) |
| `/me/notifications` | تسجيل دخول |
| `/admin` | أي دور داخلي |
| `/admin/inbox` (قسم الشكاوى) | `complaints:triage` أو `ideas:review` أو `offers:decide` |
| `/admin/complaints` | `complaints:read` |
| `/admin/complaints/[id]` | `complaints:read` |
| `/admin/audit` | `audit:read` |

## المكوّنات (PRD §12)

`WorkflowTimeline` · `ReferenceCard` · `AttachmentUploader` · `NotificationCenter` · `StatTile` · PWA / Service Worker + IndexedDB للمسودات (§7)

## Server Actions وعمليات التدقيق (§6.9)

| Action | الصلاحية | سطر التدقيق |
| --- | --- | --- |
| `complaints/submit` (idempotent بـ `clientDraftId`) | `complaints:create` | `complaint.create` |
| `complaints/submitPublic` (زائر، `submitterId = NULL`، بلا IP) | — (حد معدل مشدّد) | `complaint.create` |
| `complaints/track` | — (حد معدل IP) | — |
| `complaints/openForTriage` | `complaints:triage` | `complaint.triage` |
| `complaints/assignToCommittee` | `complaints:triage` | `complaint.assign` |
| `complaints/updateStatus` | `complaints:update_status` | `complaint.status_change` |
| `complaints/refer` | `complaints:refer` | `complaint.refer` |
| `complaints/close` · `complaints/dismiss` | `complaints:close` | `complaint.close` |
| `complaints/readContact` | `complaints:read_contact` | `complaint.contact_read` |
| `files/createUploadUrl` · `files/getDownloadUrl` | صلاحية السجل المالك | `file.download` |
| `notifications/markRead` · `markAllRead` | تسجيل دخول | — |

## معايير القبول

**AC-01** تقديم شكوى · **AC-02** تتبّع شكوى · **AC-03** فرز الوارد وتحويله · **AC-04** تحديث الحالة من اللجنة · **AC-17** مسودة بلا اتصال · **AC-19** سجل التدقيق (الشاشة)

## الاختبارات (§17 بند 11)

- وحدة: جدول الانتقالات المسموحة في §5.1 (كل انتقال غير مسموح مرفوض).
- وحدة: تشفير/فك تشفير `ComplaintContact` · مقارنة الرمز بزمن ثابت.
- تكامل: إرسالان متزامنان لا ينتجان رقمًا مكررًا · ثلاث محاولات بنفس `clientDraftId` = شكوى واحدة.
- تكامل: رئيس لجنة أخرى يتلقى رفضًا على `updateStatus` · مراقب البلدية لا يتلقى بيانات تواصل.
- تكامل: `/track` لا يعيد أحداث `isPublic = false` · رسالة فشل واحدة للرقم الخاطئ والرمز الخاطئ.
- E2E: شكوى مجهولة ← فرز ← تحويل ← حل ← إغلاق، متابعة بالرمز في كل خطوة.

## البيانات التجريبية

تبدأ من هذا السبرنت بعلامة `isDemo = true` (§15 قاعدة 4).

## Definition of Done

راجع PRD §17.

## سجل الإنجاز (2026-09-23)

| البند | الحالة |
| --- | --- |
| المسارات الأحد عشر في الجدول أعلاه — كلها في §11.2 | ✅ |
| Server Actions الجدول أعلاه كلها، بترتيب §6.2 وسطر التدقيق في نفس المعاملة | ✅ |
| جدول الانتقالات `lib/complaints/workflow.ts` — المصدر الوحيد، مطابق لـ §5.1 (مع IN_PROGRESS ↔ WAITING_RESPONSE من الخطوة 9) | ✅ |
| رمز المتابعة: 8 خانات، scrypt بملح لكل سجل، مقارنة بزمن ثابت، وطُعم يساوي زمن «رقم غير موجود» | ✅ |
| المكوّنات: WorkflowTimeline · ReferenceCard · AttachmentUploader (داخل نموذج الشكوى) · NotificationCenter · StatTile | ✅ |
| PWA: manifest + Service Worker (الإنتاج فقط) + مسودات IndexedDB بـ clientDraftId في كل البيئات | ✅ |
| الإشعارات: IN_APP داخل المعاملة، والبريد بعدها (§8.3) من `info.rafahyouth@gmail.com` · Mailpit محليًا | ✅ |
| البذرة (تطوير): 7 تصنيفات بلجانها المقترحة · 3 مناطق تجريبية · 3 شكاوى عرض `isDemo` مجهولة | ✅ |
| `npm run admin:grant -- … --all-committees` (D22) | ✅ |
| Vitest: 165 (وحدة + تكامل على PGlite) — خضراء · `npm run check` · `next build` | ✅ |
| E2E: `sprint1.spec.ts` (المسار الكامل + AC-17) · `sprint0.spec.ts` محدَّث للهبوط في `/admin` و `/me` — 6 ناجحة و 2 متخطّاة عمدًا (مسار Sprint 1 على desktop فقط لحدود IP). يُشغَّل بعد `npm run dev` (انظر playwright.config.ts) | ✅ |
| مهمة التجهيل المجدولة (D18) | ⏳ Sprint 6 — لا شكوى تبلغ 3 سنوات قبل ذلك |
| فحص ClamAV في الإنتاج (§6.5) | ⏳ Sprint 6 — في الإنتاج يبقى المرفق PENDING ولا يُنزَّل حتى ذلك |
| النشر التجريبي | ⏳ بانتظار قرار الاستضافة (Q14) |

**قرارات تنفيذ تحتاج علمكم:**

- **إعادة الإرسال بنفس المسودة تدوّر الرمز:** الجهاز الذي يعيد الإرسال لم يستلم الرمز، والخادم لا يحفظ إلا تجزئته؛ فيُعاد الرقم نفسه برمز جديد (خلال 24 ساعة وما دامت SUBMITTED). clientDraftId عشوائي لا يغادر الجهاز، فهو إثبات الملكية.
- **المرفقات تُرفع بعد إنشاء الشكوى** بالرقم + الرمز كإثبات ملكية (الزائر والمجهول بلا حساب)، خلال 24 ساعة وما دامت SUBMITTED — ويتيح ذلك رفعها بعد مزامنة المسودة (§7.2).
- **الشكوى المجهولة من حساب:** سطر `complaint.create` بلا منفّذ (`system:anonymous`)، وإلا لربط التدقيقُ الحسابَ بالشكوى (§6.7).
- **الملاحظة الداخلية هي الافتراض** في تحديث الحالة؛ النشر لمقدّم الشكوى اختيار صريح. ملاحظة الحل وسبب الاستبعاد عامّان دائمًا.
- **تعليق التحويل داخلي**، وموعد المتابعة عند التحويل للجنة **لم يُنفَّذ**: AC-03 يذكره ولا حقل له في المخطط (السؤال Q16).

## Dependencies تقنية مُدخلة من خارج السبرنت

| البند | السبب |
| --- | --- |
| لوحة `/admin` تعرض عدّادات الشكاوى فقط | المسار من Sprint 1؛ بقية المؤشرات تُضاف مع سبرنتاتها |
| `nodemailer` | إرسال البريد عبر SMTP (D19) — لا مزوّد بريد بـ API قبل النطاق الدائم |
| رسالة «صلاحية عرض فقط» في ملف الشكوى | جزء من AC-14 ④ يظهر طبيعيًا في شاشة Sprint 1 لمن لا إجراء له |
