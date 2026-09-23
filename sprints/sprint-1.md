# Sprint 1 — الشكاوى

| | |
| --- | --- |
| **الأسابيع** | 3–4 |
| **الهدف** | السلسلة الكاملة من تقديم الشكوى حتى إغلاقها |
| **معيار الإنجاز** | شكوى مجهولة تُتابَع برمزها حتى الإغلاق، ولا تُفتح بتخمين الرقم |
| **الحالة** | لم يبدأ |

## الأسئلة الحاجبة (PRD §18)

| # | السؤال | ما يتوقف عليه هنا |
| --- | --- | --- |
| Q6 | سياسة الاحتفاظ بالشكاوى وتجهيلها | بند الخصوصية في نموذج التقديم |
| Q8 | البريد الرسمي والنطاق | إشعارات البريد و SPF/DKIM |

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

## Dependencies تقنية مُدخلة من خارج السبرنت

_لا شيء بعد._
