# Sprint 2 — اللجان والمهام والأفكار

| | |
| --- | --- |
| **الأسابيع** | 5–6 |
| **الهدف** | كل لجنة تعمل على لوحتها، والأفكار تمرّ بمسارها |
| **معيار الإنجاز** | العضو لا يعتمد مهمته، ورئيس اللجنة لا يرى لجنة غيره |
| **الحالة** | لم يبدأ |

## الأسئلة الحاجبة (PRD §18)

| # | السؤال | ما يتوقف عليه هنا |
| --- | --- | --- |
| Q15 | هل تُعرض أسماء أعضاء المجلس واللجان للعامة؟ | محتوى `/committees/[slug]` |

## الاعتماديات

- Sprint 1 مكتمل (المهمة تنشأ من شكوى محوّلة).

## النماذج المستخدمة

`Committee` · `RoleAssignment` · `Task` · `TaskComment` · `Idea` · `IdeaVote` · `Notification` · `AuditLog`

## المسارات (PRD §11.2)

| المسار | الصلاحية |
| --- | --- |
| `/ideas` | `ideas:vote` للتصويت |
| `/ideas/[id]` | — |
| `/committees` | — |
| `/committees/[slug]` | — |
| `/me/ideas` | `ideas:create` |
| `/me/ideas/new` | `ideas:create` |
| `/admin/ideas` | `ideas:review` |
| `/admin/ideas/[id]` | `ideas:review` |
| `/admin/committees` | `committees:read`(لجنة) |
| `/admin/committees/[slug]` | `committees:read`(لجنة) |
| `/admin/committees/[slug]/tasks` | `tasks:read`(لجنة) |
| `/admin/tasks` | `tasks:read`(خاص) |

## المكوّنات (PRD §12)

`KanbanBoard` · `CommitteeSwitcher` · مسودة الفكرة offline (نفس آلية §7 للشكوى)

## Server Actions وعمليات التدقيق (§6.9)

| Action | الصلاحية | سطر التدقيق |
| --- | --- | --- |
| `tasks/create` (من شكوى أو مستقلة) | `tasks:create` | `task.assign` |
| `tasks/reassign` | `tasks:update` | `task.assign` |
| `tasks/move` (حتى REVIEW) | `tasks:update` | — |
| `tasks/approve` (REVIEW → DONE) | `tasks:approve` | `task.approve` |
| `tasks/comment` | `tasks:comment` | — |
| `ideas/submit` (idempotent بـ `clientDraftId`) | `ideas:create` | — |
| `ideas/vote` | `ideas:vote` | — |
| `ideas/review` (فرز، إحالة، طلب تعديل) | `ideas:review` | `idea.review` |
| `ideas/merge` | `ideas:merge` | `idea.merge` |
| `ideas/decide` (اعتماد/رفض) | `ideas:approve` | `idea.approve` |

## معايير القبول

**AC-05** مهمة من شكوى · **AC-06** تنفيذ المهمة واعتمادها · **AC-07** تقديم فكرة والتصويت · **AC-08** مراجعة فكرة واعتمادها

## الاختبارات (§17 بند 11)

- وحدة: `can()` بنطاق COMMITTEE — رئيس لجنة لا يصل لسجل لجنة أخرى.
- تكامل: إسناد لعضو خارج اللجنة مرفوض · اعتماد ذاتي مرفوض من الخادم **ومن قاعدة البيانات**.
- تكامل: التصويت مرتين لا يزيد `voteCount` · `voteCount` = عدد صفوف `IdeaVote` دائمًا · لا تصويت على فكرة مدموجة.
- E2E: رئيس لجنة ينشئ مهمة من شكوى ← العضو ينقلها إلى REVIEW ← الرئيس يعتمدها ← تظهر في سجل الشكوى.

## Definition of Done

راجع PRD §17.

## Dependencies تقنية مُدخلة من خارج السبرنت

_لا شيء بعد._
