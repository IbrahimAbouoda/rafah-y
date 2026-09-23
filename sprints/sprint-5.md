# Sprint 5 — الشفافية والتقارير والدعم

| | |
| --- | --- |
| **الأسابيع** | 11–12 |
| **الهدف** | الأرقام تُنشر للعامة، والأسئلة تجد إجابة |
| **معيار الإنجاز** | تقرير منشور بلقطة ثابتة، وبوت يجيب من قاعدة معتمدة فقط |
| **الحالة** | لم يبدأ |

## الأسئلة الحاجبة (PRD §18)

| # | السؤال | ما يتوقف عليه هنا |
| --- | --- | --- |
| Q7 | مزوّد SMS أو WhatsApp Business؟ | يبقيان خارج النطاق حتى الإجابة |
| Q9 | من يرد على الاستفسارات؟ | دور `support_officer` من الإعدادات |
| Q10 | اعتماد مؤشرات النجاح §1.8 | محتوى لوحة المؤشرات |
| Q11 | من يكتب إجابات FAQ الاثنتي عشرة؟ | بذرة FAQ |

## الاعتماديات

- Sprints 1–4 مكتملة (مصادر المؤشرات).
- صيغة التصدير (CSV / PDF / XLSX) — غير محددة في PRD.

## النماذج المستخدمة (§4.11 · §4.12)

`Report` · `FaqCategory` · `FaqEntry` · `SupportInquiry` · `Notification`

## المسارات (PRD §11.2)

| المسار | الصلاحية |
| --- | --- |
| `/` | — |
| `/how-it-works` | — |
| `/help` | — |
| `/transparency` | — |
| `/transparency/reports/[id]` | — |
| `/admin/support` | `support:read` |
| `/admin/reports` | `reports:read` |
| `/admin/settings/faq` | `faq:manage` |

## المكوّنات (PRD §12)

`TrendChart` · `SupportBotWidget` · مُنقّي Markdown (§6.3)

## Server Actions وعمليات التدقيق (§6.9)

| Action | الصلاحية | سطر التدقيق |
| --- | --- | --- |
| `reports/generate` (لقطة `metrics`) | `reports:read` | — |
| `reports/export` | `reports:export` | — |
| `reports/publish` | `reports:publish` | `report.publish` |
| `faq/create` · `faq/update` · `faq/disable` | `faq:manage` | `faq.create` · `faq.update` · `faq.disable` |
| `support/ask` (مطابقة §13.2 أو `SupportInquiry` NEW) | `support:ask` (حد معدل 20/ساعة) | — |
| `support/assign` · `support/close` | `support:respond` | — |
| `support/answer` (± تحويل إلى FAQ) | `support:respond` (+ `faq:manage` للتحويل) | `inquiry.answer` |

## معايير القبول

**AC-14** لوحة مراقب البلدية · **AC-15** تقرير ونشره · **AC-18** بوت الاستفسارات والرد البشري

## الاختبارات (§17 بند 11)

- وحدة: التطبيع العربي (§13.2) — التشكيل، `أ إ آ`، `ة`، `ى`، الترقيم · ترتيب النتائج والحد الأدنى للتشابه.
- تكامل: سؤال بلا تطابق لا يعيد أي نص إجابة · سؤال معطّل لا يظهر فورًا.
- تكامل: تعديل شكوى بعد نشر التقرير لا يغيّر `metrics` · التقرير المنشور بلا بيانات شخصية.
- تكامل: مراقب البلدية يتلقى 403 على كل إجراء تعديل · التصدير بنفس قيود الحقول.
- E2E: سؤال بلا إجابة ← استفسار ← رد + تحويل إلى FAQ ← البوت يجده في المحاولة التالية.

## Definition of Done

راجع PRD §17.

## Dependencies تقنية مُدخلة من خارج السبرنت

_لا شيء بعد._
