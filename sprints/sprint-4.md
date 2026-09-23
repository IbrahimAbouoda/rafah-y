# Sprint 4 — الفرص والأنشطة والملف

| | |
| --- | --- |
| **الأسابيع** | 9–10 |
| **الهدف** | الشاب يجد فرصة ويتقدّم بموافقته، ويحضر نشاطًا |
| **معيار الإنجاز** | المؤسسة ترى المتقدّم فقط إذا وافق على مشاركة ملفه |
| **الحالة** | لم يبدأ |

## الأسئلة الحاجبة (PRD §18)

| # | السؤال | ما يتوقف عليه هنا |
| --- | --- | --- |
| Q12 | ما البيانات التي تراها المؤسسة من ملف الشاب الموافق؟ | حقول `opportunities:applicants` و `ConsentDialog.dataPoints` |

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

## Dependencies تقنية مُدخلة من خارج السبرنت

_لا شيء بعد._
