# Sprint 3 — المبادرات وادعمنا والمؤسسات

| | |
| --- | --- |
| **الأسابيع** | 7–8 |
| **الهدف** | الاحتياج المرقّم يصل المؤسسة ويعود عرض دعم |
| **معيار الإنجاز** | قبول عرض دعم يحدّث الاحتياج والشركاء، والمبلغ المؤمَّن من قيد معتمد |
| **الحالة** | لم يبدأ |

## الأسئلة الحاجبة (PRD §18)

| # | السؤال | ما يتوقف عليه هنا |
| --- | --- | --- |
| Q4 | هل تحتاج كل مبادرة موافقة البلدية؟ | وجود مرحلة موافقة بلدية في مسار المبادرة |

## الاعتماديات

- Sprint 2 مكتمل (الفكرة المعتمدة تتحول إلى مبادرة · مسودة Concept Note تظهر في مهام لجنة المؤسسات).
- العملة/العملات المعتمدة للمبالغ — غير محددة في PRD.

## النماذج المستخدمة (§4.6 · §4.7 · §4.8)

`Initiative` · `InitiativeNeed` · `SupportOffer` · `InitiativePartner` · `InitiativeUpdate` · `FundingRecord` · `Organization` · `OrgContact` · `Interaction` · `PartnerMembership` · `Agreement` · `DemandPoll` · `DemandOption` · `DemandVote` · `ConceptNote`

## المسارات (PRD §11.2)

| المسار | الصلاحية |
| --- | --- |
| `/initiatives` | — |
| `/initiatives/[slug]` | — |
| `/demand` | `demand:vote` |
| `/support` | — |
| `/partner` | دور مؤسسة |
| `/partner/needs` | `offers:create` |
| `/partner/offers` | `offers:read`(خاص) |
| `/admin/initiatives` | `initiatives:update` |
| `/admin/initiatives/[id]` | `initiatives:update` · `initiatives:manage_needs` |
| `/admin/organizations` | `organizations:read` |
| `/admin/organizations/[id]` | `organizations:read` · `organizations:log` |
| `/admin/finance` | `finance:read` |

## Server Actions وعمليات التدقيق (§6.9)

| Action | الصلاحية | سطر التدقيق |
| --- | --- | --- |
| `initiatives/create` · `initiatives/update` | `initiatives:create` · `initiatives:update` | — |
| `initiatives/approve` | `initiatives:approve` | `initiative.approve` |
| `initiatives/upsertNeed` · `removeNeed` | `initiatives:manage_needs` | `need.change` |
| `initiatives/postUpdate` | `initiatives:post_update` | — |
| `offers/submit` | `offers:create` | — |
| `offers/decide` | `offers:decide` | `offer.decide` |
| `funding/record` | `finance:record` | `funding.record` |
| `funding/approve` | `finance:approve` | `funding.approve` |
| `organizations/upsert` · `setStage` | `organizations:manage` | — |
| `organizations/logInteraction` | `organizations:log` | — |
| `demand/createPoll` · `setThreshold` | `demand:manage` | — |
| `demand/vote` (ينشئ `ConceptNote` مسودة عند بلوغ الحد) | `demand:vote` | — |
| `conceptNotes/approve` | `concept_notes:approve` | `conceptnote.approve` |
| `conceptNotes/markSent` (يُرفض دون `approvedAt`) | `concept_notes:approve` | `conceptnote.send` |

## معايير القبول

**AC-09** مبادرة باحتياجات مرقّمة · **AC-10** عرض دعم وقراره · **AC-12** التصويت على مجال تدريب ومسودة Concept Note

## الاختبارات (§17 بند 11)

- وحدة: حساب المبلغ المؤمَّن = مجموع `FundingRecord` الواردة المعتمدة فقط.
- تكامل: قبول عرض مالي ينشئ `FundingRecord` **غير معتمد** · اعتماد القيد من مسجّله مرفوض من قاعدة البيانات.
- تكامل: المؤسسة لا ترى عروض غيرها · المبادرة غير المعتمدة لا تظهر في `/initiatives`.
- تكامل: بلوغ الحد مرتين لا ينشئ مسودتين · إرسال مسودة غير معتمدة مرفوض.
- E2E: احتياج ← عرض دعم من مؤسسة ← قبول الرئيس ← قيد يسجّله أمين الصندوق ← يعتمده الرئيس ← المبلغ المؤمَّن يتحدّث.

## Definition of Done

راجع PRD §17.

## Dependencies تقنية مُدخلة من خارج السبرنت

_لا شيء بعد._
