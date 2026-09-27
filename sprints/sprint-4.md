# Sprint 4 — الفرص والأنشطة والملف

| | |
| --- | --- |
| **الأسابيع** | 9–10 |
| **الهدف** | الشاب يجد فرصة ويتقدّم بموافقته، ويحضر نشاطًا |
| **معيار الإنجاز** | المؤسسة ترى المتقدّم فقط إذا وافق على مشاركة ملفه |
| **الحالة** | مكتمل (2026-09-27) |

## الأسئلة الحاجبة (PRD §18)

| # | السؤال | ما يتوقف عليه هنا |
| --- | --- | --- |
| Q12 | ~~ما البيانات التي تراها المؤسسة من ملف الشاب الموافق؟~~ **مُجاب 2026-09-27 (D31):** الملف مع التواصل | حقول `opportunities:applicants` و `ConsentDialog.dataPoints` |

## الاعتماديات

- Sprint 3 مكتمل (المؤسسات و `PartnerMembership`).

## النماذج المستخدمة (§4.4 · §4.9)

`YouthProfile` · `YouthSkill` · `Skill` · `Opportunity` · `OpportunitySkill` · `OpportunityApplication` · `Activity` · `ActivityRegistration` · `ActivityPartner`

## المسارات (PRD §11.2)

| المسار | الصلاحية |
| --- | --- |
| `/opportunities` | — |
| `/opportunities/[id]` | `opportunities:apply` |
| `/activities` | — |
| `/activities/[id]` | `activities:register` |
| `/me/applications` | `opportunities:apply` |
| `/me/profile` | `profiles:update`(خاص) |
| `/partner/opportunities` | `opportunities:create` |
| `/partner/opportunities/new` | `opportunities:create` |
| `/admin/opportunities` | `opportunities:publish` |
| `/admin/activities` | `activities:update` |
| `/admin/activities/[id]/attendance` | `activities:attendance` |

## المكوّنات (PRD §12)

`ConsentDialog`

## Server Actions وعمليات التدقيق (§6.9)

| Action | الصلاحية | سطر التدقيق |
| --- | --- | --- |
| `profile/update` · `profile/setConsent` | `profiles:update` | — |
| `opportunities/create` (→ PENDING_REVIEW) | `opportunities:create` | — |
| `opportunities/publish` | `opportunities:publish` | `opportunity.publish` |
| `opportunities/apply` (مع `shareProfile` صريح) | `opportunities:apply` | — |
| `opportunities/listApplicants` · `viewApplicant` | `opportunities:applicants` | `application.view` |
| `activities/create` · `activities/update` | `activities:create` · `activities:update` | — |
| `activities/register` (WAITLISTED عند الامتلاء) · `activities/rate` | `activities:register` | — |
| `activities/markAttendance` | `activities:attendance` | — |

## معايير القبول

**AC-11** نشر فرصة والتقديم عليها · **AC-13** التسجيل في نشاط وتسجيل الحضور

## الاختبارات (§17 بند 11)

- تكامل: المؤسسة لا تتلقى أي بيانات شخصية لطلب `shareProfile = false` · قراءة بيانات متقدّم تكتب `application.view`.
- تكامل: التقديم مرتين مرفوض · فرصة منتهية الموعد لا تقبل طلبات · فرصة EXTERNAL لا تقبل طلبات.
- تكامل: امتلاء المقاعد يعطي WAITLISTED · تقييم من غير الحاضر مرفوض · تقييم خارج 1–5 مرفوض من قاعدة البيانات.
- تكامل: سحب `shareWithPartners` لا يحذف طلبًا سابقًا.
- E2E: مؤسسة تنشئ فرصة ← أمين السر ينشرها ← شاب يتقدّم بموافقة ← المؤسسة ترى ملفه.

## Definition of Done

راجع PRD §17.

## سجل الإنجاز (2026-09-27)

| البند | الحالة |
| --- | --- |
| المسارات الأحد عشر في الجدول أعلاه — كلها في §11.2، بلا مسار جديد | ✅ |
| Server Actions الجدول كلها، و `listApplicants` دالة خادم (`lib/opportunities/queries.ts`) تفحص الصلاحية وتعيد القائمة بلا بيانات شخصية | ✅ |
| إضافات بقرار: `opportunities/review` (نشر أو رفض بنفس سطر `opportunity.publish`) · `close` · `withdraw` · `setApplicationStatus` (D33) | ✅ |
| `ConsentDialog`: الرفض افتراضي وعليه التركيز، لا يُغلق بـ Esc ولا بزر إغلاق، ونصّه = ما يعيده `viewApplicant` حرفيًا (`APPLICANT_DATA_POINTS`) | ✅ |
| مسارا الفرصة والطلب `lib/opportunities/workflow.ts`، ومسار النشاط `lib/activities/workflow.ts` | ✅ |
| المقاعد: قفل صف النشاط (`FOR UPDATE`) داخل معاملة التسجيل، فلا يأخذ طلبان المقعد الأخير معًا | ✅ |
| الإشعارات (§8.2): نشر الفرصة داخل المنصة للمؤسسة بلا بريد · تغيّر حالة الطلب للمتقدّم داخل المنصة وبالبريد | ✅ |
| البذرة: 22 مهارة مرجعية في الإنتاج (D32) · فرصة ونشاط عرض (`isDemo`) في التطوير | ✅ |
| لا migration: كل النماذج والقيود موجودة، ومنها `activity_registrations_rating_range` | ✅ |
| Vitest: 273 (منها 25 تكامل جديد و 21 وحدة) · `tsc` · lint | ✅ |
| E2E: `sprint4.spec.ts` (فرصة ← نشر ← تقديم بموافقة عبر الحوار ← المؤسسة ترى الملف ← سطر `application.view`) · sprint0–3 بلا تراجع — 10 ناجحة · 360px بلا تمرير أفقي في الوضعين | ✅ |

**قرارات تنفيذ تحتاج علمكم:**

- **D31 — ما تراه المؤسسة:** القائمة «متقدّم رقم n» بحالته وموافقته فقط؛ الاسم والتواصل والملف بزر «عرض بيانات المتقدّم» لكل طلب، وكل نقرة سطر تدقيق. الطلب المسحوب لا يُقرأ.
- **D33 — حالة الطلب:** المؤسسة تدير الطلب الموافق صاحبه فقط؛ طلب بلا موافقة يبقى «مُرسل» ويظهر لها بلا أي بيانات. هذا يُقال للشاب في زر «أرسل دون مشاركة ملفي» وفي «طلباتي».
- **D34 — النشاط بلجنة إلزاميًا:** وإلا لا أحد يسجّل حضوره. عضو اللجنة (لا يملك `activities:update`) يصل للحضور من بطاقة «أنشطة اللجنة والحضور» في لوحة لجنته.
- **رفض الفرصة بلا سبب مكتوب:** `Opportunity` بلا حقل سبب، ولا نوع إشعار للرفض في §8.2؛ المؤسسة ترى «لم تُنشر — تواصلوا مع أمانة السر». إن أردتم سببًا مكتوبًا فهو حقل جديد (C1).
- **آخر موعد الفرصة** = نهاية اليوم المختار بتوقيت غزة، ومواعيد الأنشطة تُقرأ بتوقيت غزة لا بتوقيت الخادم.
- **لا إلغاء تسجيل ولا ترقية آلية من قائمة الانتظار:** ليست في جدول السبرنت. الحاضر من قائمة الانتظار يُعلَّم حضوره عاديًا.

## Dependencies تقنية مُدخلة من خارج السبرنت

| البند | السبب |
| --- | --- |
| `FlashProvider` في التخطيط العام `(public)` | أول نماذج تغيّر حالة صفحة عامة (التقديم، التسجيل، التقييم): النموذج يزول بعد النجاح فتضيع رسالته — نفس حل Sprint 3 في AppShell |
| `ActionForm` يقبل `id` | إرسال النموذج بعد قرار `ConsentDialog` |
| `gazaDateTime()` · `toDateTimeInput()` في `lib/utils.ts` | حقول `datetime-local` بتوقيت غزة |
| بطاقة «أنشطة اللجنة والحضور» في `/admin/committees/[slug]` | طريق عضو اللجنة لصفحة الحضور (D34) |
| رسالة عربية لقيد `activity_registrations_rating_range` في `lib/action.ts` | القيد موجود منذ Sprint 0 ولم يكن له نص |
