# Sprint 3 — المبادرات وادعمنا والمؤسسات

| | |
| --- | --- |
| **الأسابيع** | 7–8 |
| **الهدف** | الاحتياج المرقّم يصل المؤسسة ويعود عرض دعم |
| **معيار الإنجاز** | قبول عرض دعم يحدّث الاحتياج والشركاء، والمبلغ المؤمَّن من قيد معتمد |
| **الحالة** | قيد التنفيذ (بدأ 2026-09-25) — الكود والاختبارات مكتملة؛ ينتظر النشر التجريبي (Q14) |

## الأسئلة الحاجبة (PRD §18)

| # | السؤال | ما يتوقف عليه هنا |
| --- | --- | --- |
| Q4 | ~~هل تحتاج كل مبادرة موافقة البلدية؟~~ **مُجاب (D25):** لا | مسار المبادرة ✅ |

## الاعتماديات

- Sprint 2 مكتمل (الفكرة المعتمدة تتحول إلى مبادرة · مسودة Concept Note تظهر في مهام لجنة المؤسسات).
- العملة: ILS افتراضيًا و USD مسموحة (D13)؛ المبالغ لا تُجمع عبر العملات.

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

## سجل الإنجاز (2026-09-25)

| البند | الحالة |
| --- | --- |
| المسارات الاثنا عشر في الجدول أعلاه — كلها في §11.2 | ✅ |
| Server Actions الجدول كلها + `organizations/linkMember · unlinkMember` (D26) و `conceptNotes/edit` | ✅ |
| مسار المبادرة `lib/initiatives/workflow.ts` (D25) · المبلغ المؤمَّن `securedTotals()` بالقروش ولكل عملة | ✅ |
| بوابة المؤسسات `/partner`، ونطاق «خاص» = مؤسسات المستخدم (D27) | ✅ |
| القبول يضيف الشريك ويحدّث حالة الاحتياج؛ القيد يسجّله أمين الصندوق من «عروض مقبولة بانتظار قيدها» (D29) | ✅ |
| بلوغ حد الطلب ينشئ Concept Note مسودة واحدة (`demandOptionId` فريد + نقطة حفظ للتزامن) ومهمة في لجنة المؤسسات والشراكات | ✅ |
| البذرة (تطوير): مؤسسة عرض ومبادرة عرض منشورة بأربعة احتياجات مرقّمة (`isDemo`) | ✅ |
| Vitest: 231 · `npm run check` | ✅ |
| E2E: `sprint3.spec.ts` (ربط الممثل ← عرض ← قبول ← قيد أمين الصندوق ← اعتماد الرئيس ← المبلغ المؤمَّن) · sprint0/1/2 بلا تراجع — 9 ناجحة | ✅ |

**قرارات تنفيذ تحتاج علمكم:**

- **D29 — القيد المالي:** القبول لا ينشئ قيدًا (قيد يُنسب للرئيس لا يعتمده أحد بحكم `funding_four_eyes`)؛ أمين الصندوق يسجّله مرتبطًا بالعرض، والرئيس يعتمده.
- **D30 — تبويبا الطلب و Concept Note** في `/admin/initiatives?tab=demand|notes`: §11.2 لا يعرّف لهما مسارًا، فلم يُنشأ مسار جديد (C8). كل تبويب بصلاحيته.
- **تغطية الاحتياج:** غير المالي يُغطّى بعرض مقبول واحد؛ المالي حين تبلغ العروض المقبولة بعملته مبلغه، وإلا «مغطّاة جزئيًا». الاحتياج بلا حقل عملة ⇒ يُعدّ بالشيكل.
- **تحرير المسودة** قبل الاعتماد للرئيس (`concept_notes:approve`)؛ لجنة المؤسسات تراجعها عبر المهمة المنشأة لها.
- **لا تسجيل ذاتي للمؤسسات (D26):** `/support` يشرح الخطوات ويوجّه للبريد الرسمي.

## Dependencies تقنية مُدخلة من خارج السبرنت

| البند | السبب |
| --- | --- |
| `NavItem.permission` يقبل قائمة صلاحيات | `/admin/initiatives` يحمل تبويبات بصلاحيات مختلفة (D30) |
| `ActionButtons` (مكوّن مشترك) | إجراءات بنقرة واحدة تبقى نتيجتها ظاهرة بعد تغيّر الحالة |
| `allScopeHoldersOf()` في `lib/notify.ts` | مستلمو «وصول عرض دعم» (§8.2) بالصلاحية لا باسم الدور |
| `FlashProvider` في AppShell | نتيجة الإجراء تبقى ظاهرة حين يزول نموذجه بعد تغيّر الحالة (قرار العرض، اعتماد القيد…) — حلّ عام بدل حلول كل شاشة في Sprint 1 و 2 |
| معرّف فريد لكل `Field` (`useId`) | صفحات تكرّر النموذج نفسه (قيد لكل عرض، قرار لكل عرض) كانت تربط العنوان بحقل نموذج آخر — خلل إمكانية وصول |
