# Rafah Pulse — Code & Security Audit

| | |
| --- | --- |
| **Date** | 2026-09-27 |
| **Scope** | Whole repository at `sprint-5` (= `main` @ `09d2317`, Sprints 0–4): 71 Server Actions, 1 Route Handler, 56 pages, `proxy.ts`, Prisma schema and migrations, local Supabase configuration |
| **Method** | Static review of every Server Action and protected page, targeted reading of auth / RBAC / consent / upload paths, and read-only probes against the **local** Supabase instance (privilege catalog queries and anon-key REST counts). No data was modified. |
| **Verdict** | Application-layer RBAC is consistently enforced and well tested. One **critical** infrastructure-level exposure bypassed it entirely. |
| **Remediation (2026-09-27)** | C-1, H-1, H-2, M-1 to M-5 and L-4 **fixed** — see [Remediation status](#remediation-status). L-1 to L-3 and the architecture / clean-code items remain open. |

## Summary

| Severity | Count | Items |
| --- | --- | --- |
| Critical | 1 | C-1 Supabase Data API grants `anon` full CRUD on all 60 tables |
| High | 2 | H-1 spoofable client IP defeats all IP rate limits · H-2 rate limiting silently falls back to per-instance memory in production |
| Medium | 5 | M-1 partner reps' emails shown to all `organizations:read` holders · M-2 unscoped offers on organization page · M-3 login lockout key depends on spoofable IP · M-4 password change without re-authentication · M-5 raw error objects logged |
| Low | 4 | L-1 proxy fails open without Supabase env · L-2 no throttling on authenticated create actions · L-3 two lint suppressions around effects · L-4 no automated check that the Data API stays closed |

---

## 1. Security Vulnerabilities & Risk Severity

### C-1 — Critical: every table is readable and writable with the public anon key

**Evidence (local instance):**

- `supabase/config.toml` exposes schema `public` through the Data API (`[api] schemas = ["public", "graphql_public"]`).
- All Prisma tables live in `public`. The migrations contain no `REVOKE`, no `ENABLE ROW LEVEL SECURITY`, and no policies.
- A catalog query shows **60 of 60 tables** grant `anon` `SELECT`, `INSERT`, `UPDATE` and `DELETE`. **0 tables** have RLS enabled. This includes `_prisma_migrations`.
- A REST request using only `NEXT_PUBLIC_SUPABASE_ANON_KEY` returned row counts for `users` (203), `audit_logs` (485), `role_assignments` (355) and `opportunity_applications` (5).

**Impact:** the anon key is public by definition: it ships in the browser bundle, and §6.10 says so. Anyone can therefore:

- **Read personal data** directly: user emails and phones, applications regardless of `shareProfile`, and the audit trail. This bypasses `can()`, D31 consent, §6.7 anonymity and §3.4 ("municipality sees no personal data").
- **Escalate privileges:** insert a `role_assignments` row granting `council_president` to their own account.
- **Tamper with evidence:** insert forged `audit_logs` rows (existing rows are protected: the `audit_logs_append_only` trigger blocks `UPDATE`/`DELETE`/`TRUNCATE` for every role), and alter or delete complaints, funding records and approvals. This bypasses `funding_four_eyes` by editing `approvedById`. *(Corrected after the audit: the first version said audit rows could be edited or deleted.)*
- **Call functions over RPC:** functions in `public` are executable by `PUBLIC` by default, which likely includes `next_ref()`. Calling it would burn reference numbers.

`complaint_contacts` fields are encrypted (AES, `lib/crypto.ts`), so contact data stays confidential. It is still deletable.

**Fix (new migration — C11, no edit to published ones):**

```sql
-- The app connects as the table owner through Prisma and does not use PostgREST for app tables.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, PUBLIC;
-- Defence in depth: RLS on with no policies = deny for every non-owner role.
-- (Generate one ALTER TABLE … ENABLE ROW LEVEL SECURITY per table in the migration.)
```

Also, for production:

- Remove `public` from the exposed API schemas in the hosted project's settings.
- Confirm the `storage.objects` policies for the private buckets. Uploads go through service-role-signed URLs, so no `anon` policy should exist.
- Verify the migration still works under PGlite, which has no `anon`/`authenticated` roles. Guard it with `DO $$ … IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') …`, or apply it through a Supabase-only step.

Add the check in L-4 so this cannot regress.

---

### H-1 — High: client IP is taken from the left-most `X-Forwarded-For` value

`lib/request.ts → clientIp()` returns `x-forwarded-for.split(',')[0]`. Behind most proxies the left-most entry is whatever the client sent, so an attacker can rotate it on every request. That bypasses every IP-keyed limit in `lib/rate-limit.ts`:

| Limit bucket | What becomes unlimited |
| --- | --- |
| `publicComplaint` (2/h, D21) | Anonymous complaint spam, which flows into the secretariat inbox |
| `upload` | Storage abuse, capped only by the per-complaint file limit and the 24 h window |
| `register` · `resetPassword` | Account and email flooding through Mailpit / Gmail SMTP (D19) |
| `track` | Access-code guessing. Still impractical: 8 characters from a 31-symbol alphabet (≈ 40 bits) with scrypt |
| login lockout (`ip|identifier`) | See M-3 |

**Fix:** derive the IP from a header the hosting platform sets and a client cannot forge. Examples: `x-real-ip` on Vercel, or the right-most untrusted hop with a configured `TRUSTED_PROXY_HOPS`. Make this configurable, and fail to a fixed bucket rather than `'unknown'`. For `track`, also key the limit on the reference number.

### H-2 — High: production silently uses per-instance memory for rate limits

`lib/rate-limit.ts → store()` falls back to the in-process `MemoryStore` whenever the `UPSTASH_REDIS_REST_*` variables are missing, in any environment. On serverless or multi-instance hosting, each instance then counts separately and resets on cold start. D11 requires Upstash in production.

**Fix:** in production, throw at first use (or at boot) when Upstash is not configured. Keep the LRU store for development and tests only.

---

### M-1 — Medium: partner representatives' emails are visible to every `organizations:read` holder

`app/admin/organizations/[id]/page.tsx` always selects `members.user.email` and renders it. Roles with `organizations:read` at "all" scope include the municipality observer, committee heads and members, and the treasurer. This contradicts §3.4 ("البلدية بلا بيانات شخصية") and the principle that sensitive columns are not sent to those without the permission (§12 DataTable).

**Fix:** select `email` only when `can(user, 'organizations:manage')`. Otherwise show names only.

### M-2 — Medium: organization page lists offers with an unscoped check

The same page decides `readOffers = can(user, 'offers:read')` without context. A committee head, whose `offers:read` is committee-scoped, therefore sees the organization's offers to initiatives of every committee.

**Fix:** filter `offers` by `initiative.committeeId` using `scopeFilter(user, 'offers:read')`, as the list pages already do.

### M-3 — Medium: login lockout keyed on `ip|identifier`

`loginAction` keys failures on `${clientIp()}|${identifier}`. Combined with H-1, the attacker gets a fresh counter for every spoofed IP, so there is no effective per-account throttle in the app. Supabase Auth has its own limits; they are not verified for the hosted project.

**Fix:** add a second counter keyed on the identifier alone, with exponential backoff rather than a hard lock, to avoid lockout-DoS. Confirm the Supabase Auth rate-limit settings in the production project.

### M-4 — Medium: password change requires only an active session

`setNewPasswordAction` accepts any logged-in session, then signs out all other sessions. A stolen session cookie can change the password and lock the real owner out.

**Fix:** allow it only within a recovery session (the reset-link flow), or require the current password (Supabase "secure password change" / reauthentication). Keep the "sign out others" behaviour.

### M-5 — Medium: unexpected errors are logged as whole objects

`lib/action.ts → errorState()` calls `console.error('[action]', e)`. Prisma and driver errors can embed query parameters, which may include phone numbers, names or free text from complaints, so these end up in hosting logs.

**Fix:** log `e.name`, `e.code` and a truncated `e.message` with a request id. Never log the whole object or its `meta`. `lib/mail.ts` and `lib/notify.ts` already log only `.message` — follow that pattern.

---

### L-1 — Low: `proxy.ts` skips the coarse login check when the Supabase env is missing

If `NEXT_PUBLIC_SUPABASE_URL` or the anon key is unset, protected prefixes are not redirected. Pages still enforce `guardPage()`, so data does not leak, but in production it should fail closed. **Fix:** in production, return 503 when the env is missing.

### L-2 — Low: no throttling on authenticated create actions

Only complaints are rate-limited per account. `ideas/submit`, `opportunities/apply`, `activities/register`, `offers/submit` and `demand/vote` rely on uniqueness constraints only. A scripted account can flood idea submissions or offers. **Fix:** per-user buckets for the create actions (ideas, offers, opportunities).

### L-3 — Low: two `react-hooks/exhaustive-deps` suppressions

These are in `components/complaints/complaint-form.tsx:158` and `components/ideas/idea-form.tsx:93`, around draft re-send. They are not a vulnerability, but stale closures in offline re-send can submit outdated field values. **Fix:** see Q-5.

### L-4 — Low: nothing prevents C-1 from regressing

Integration tests run on PGlite, which has no `anon` role, so the exposure is invisible to the test suite. **Fix:** add an E2E / CI check that calls `/rest/v1/<table>` with the anon key for a few sensitive tables and expects `401`/`403`/`404`. Also add a SQL check (`has_table_privilege('anon', …)`) to the release checklist.

---

### Controls verified as correct

| Area | Finding |
| --- | --- |
| Server Actions | All 71 exported actions checked. Every one outside the documented exceptions calls `requireUser()` → `requirePermission()` (no context) → Zod → `requirePermission()` with the record's scope (D7). **Exceptions:** `submitPublicComplaintAction` has no user by design (D1) but is IP rate-limited (see H-1); `trackComplaintAction` uses reference + scrypt-hashed code, rate-limited; upload actions authorize with reference + access code; notification actions filter by `userId` inside the `WHERE`; auth actions are rate-limited |
| Pages | All 39 protected pages (`/admin`, `/me`, `/partner`) call `guardPage()`. Detail pages re-check the specific record (`complaints/[id]`, `ideas/[id]`, `initiatives/[id]`, `committees/[slug]`, `…/tasks`, attendance), returning `notFound()` to avoid confirming existence. List pages filter by `scopeFilter()` / `readableComplaints()`. The exceptions are M-1 and M-2 |
| BOLA / IDOR | Target ids always come from the database record, never trusted for scope; own-scope actions pass `ownerId` from the record (`applicantId`, `submitterId`, org members). Profile actions never accept a user id |
| Mass assignment | No `data: { ...input }` into Prisma anywhere; every write maps fields explicitly from the parsed schema |
| Injection | Raw SQL only through tagged `$queryRaw` / `$executeRaw` (parameterised); no `*Unsafe`, no `dangerouslySetInnerHTML`, no `eval`. External URLs are validated `http(s)` only and rendered with `rel="noopener noreferrer nofollow"` |
| Consent & audit (D31) | Applicant data never leaves the server in lists (`listApplicants` selects no personal columns). `viewApplicantAction` requires `shareProfile = true`, blocks withdrawn applications, and writes `application.view` in a transaction without copying values. Complaint contact decryption follows the same pattern (`complaint.contact_read`) |
| Secrets | `SUPABASE_SERVICE_ROLE_KEY` and `CONTACT_ENCRYPTION_KEY` are read only in `server-only` modules (`lib/storage.ts`, `lib/crypto.ts`); only `NEXT_PUBLIC_SUPABASE_URL` / anon key reach the client |
| Headers / CSP | Nonce-based CSP with `strict-dynamic`, `frame-ancestors 'none'`, `object-src 'none'`; HSTS, `nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`; `poweredByHeader: false` |
| Sessions / redirects | `supabase.auth.getUser()` (server-verified) rather than `getSession()`; `safeNextPath()` blocks open redirects on login |
| Uploads | Signed upload URLs, server-side size + magic-byte + SHA-256 verification, `PENDING` until scanned; the mock scanner is disabled in production (files stay `PENDING`, never downloadable) |
| Access codes | 8 characters from an unambiguous 31-symbol alphabet via `crypto.randomInt`, scrypt-hashed with salt, compared with `timingSafeEqual` |

---

## 2. Architecture & Modularization Recommendations

The layering is sound and mostly followed:

- `app/` holds routes and pages.
- `components/` holds UI.
- `server/actions/<domain>` holds use cases (auth → validate → scope → transaction → audit).
- `lib/<domain>/workflow.ts` holds pure domain rules, unit-tested.
- `lib/<domain>/queries.ts` holds scoped reads.
- `lib/*` holds infrastructure (db, storage, mail, rate-limit, crypto).

The recommendations below tighten where the boundaries blur.

| # | Recommendation | Why | Priority |
| --- | --- | --- | --- |
| A-1 | **Move data loading out of pages into `lib/<domain>/queries.ts`.** 51 of 56 pages call Prisma directly, and the largest carry scope logic inline (`admin/initiatives/[id]` 390 lines, `admin/initiatives` 343, `admin/complaints/[id]` 320, `admin/organizations/[id]` 255). | Scope rules inside JSX are untestable and are where M-1 and M-2 slipped in. The `readableComplaints()` / `listApplicants()` pattern is testable: extend it (`readableOffers()`, `organizationView(user, id)`, `activitiesFor(user)`). | High |
| A-2 | **One helper for "committees where the user holds key X".** The inline `scopeFilter(user, …)` → `committeeId: { in: … }` pattern appears in 7 pages, plus a local `committeesWith()` in `admin/activities`. | A single `committeeScopeWhere(user, key)` in `lib/committees.ts` (next to `readableCommitteesWhere`) removes duplication and makes scoping reviewable in one place. | High |
| A-3 | **Split validation modules by domain.** `lib/validation/opportunities.ts` holds profile + opportunity + activity schemas. `lib/validation/complaints.ts` also holds file-upload and notification schemas. | Imports reveal domain boundaries; today they mislead. Target: `profile.ts`, `opportunities.ts`, `activities.ts`, `files.ts`, `notifications.ts`. | Medium |
| A-4 | **Break up the largest action modules by use case.** `complaints/workflow.ts` (346), `opportunities/index.ts` (344), `ideas/index.ts` (311). | Keep each file a thin list of actions. Move notification composition and repeated "load record + scope check" steps into `lib/<domain>/` services (e.g. `loadApplicationForOrg` is already a good local example). | Medium |
| A-5 | **Enforce layer boundaries with lint.** Add `no-restricted-imports`: `components/**` must not import `@/lib/db`, `@/lib/storage` or `@/lib/crypto`; `lib/**/workflow.ts` must not import `@/lib/db`. | Today the rule holds by convention only. `server-only` catches client imports at build time but not layering inside the server. | Medium |
| A-6 | **Complete the loading / error boundaries (DoD 6–7).** `loading.tsx` exists only under `app/admin` and `app/me`. `app/partner` and `app/(public)` have neither `loading.tsx` nor `error.tsx` (the root `app/error.tsx` catches errors but drops the layout). | Slow connections are a stated constraint ("اتصال غير مضمون"). Add `app/partner/loading.tsx`, `app/partner/error.tsx`, `app/(public)/loading.tsx`, `app/(public)/error.tsx` using the existing `PageSkeleton` / error state. | Medium |
| A-7 | **Finish the `/admin/inbox` sections promised by D4.** Only the complaints section exists; the page still tells idea reviewers and offer deciders that their sections come "in later phases". | This is a functional gap in shipped Sprints 2–3 rather than a security issue. The nav comment in `lib/nav.ts` also still hides the inbox from them. | Medium |
| A-8 | **Structured server logging.** There is no request id and logs go to four ad-hoc `console.error` call sites. | Needed to act on M-5 and for incident response; a tiny `lib/log.ts` (level, event, request id, scrubbed fields) is enough. | Low |

---

## 3. Quick Clean-Code Wins / Refactoring Targets

| # | Target | Change | Effort |
| --- | --- | --- | --- |
| Q-1 | UUID route-param check `/^[0-9a-f-]{36}$/i` repeated in **8** pages | `isUuid(id)` in `lib/validation/common.ts` (or parse params with `z.uuid()`) | XS |
| Q-2 | `X.includes(raw as T) ? (raw as T) : …` in `(public)/ideas`, `(public)/opportunities`, `admin/ideas` | Generic type guard `oneOf(values, raw): raw is T` — removes 6 casts | XS |
| Q-3 | "Does this area / skill / organization exist?" repeated in profile, opportunities and activities actions (**4** area checks, **2** skill checks, **1** organization check) | `assertAreaExists(id)`, `assertSkillsExist(ids)` helpers returning the standard `invalid()` field error | S |
| Q-4 | "Account not linked to an organization" empty state copied in **4** partner pages | `<NotLinkedToOrganization />` in `components/shared` | XS |
| Q-5 | Offline-draft logic duplicated between `complaint-form.tsx` (515 lines) and `idea-form.tsx` (249), each with an `exhaustive-deps` suppression | Extract `useOfflineDraft(scope, send)` hook; use `useEffectEvent` for the re-send callback to drop both suppressions (fixes L-3) | M |
| Q-6 | `data.toStatus as InitiativeStatus` in `server/actions/initiatives/index.ts:129`; `file.mimeType as Parameters<…>` in `server/actions/files/index.ts:138` | Build the Zod enums from the Prisma enum objects (`z.enum(InitiativeStatus)`) and store `mimeType` as a narrowed union so no cast is needed | S |
| Q-7 | `mySkills` cast to `Record<string, SkillLevel>` in `app/me/profile/page.tsx:46` | Type the `Object.fromEntries` input as `[string, SkillLevel][]`; the cast disappears | XS |
| Q-8 | Idea draft fields read from IndexedDB with `draft.fields as Fields` (`idea-form.tsx:77,81`) | Parse with the client-side schema before use; the server re-validates anyway, but a malformed local draft currently reaches state unchecked | S |
| Q-9 | `lib/nav.ts` has two stacked JSDoc blocks on `NavItem`; one belongs to the removed single-permission form | Merge into one comment | XS |

### Type-safety snapshot

- `any`: **0** occurrences outside generated code.
- `@ts-ignore` / `@ts-expect-error`: **0**.
- `eslint-disable`: **2** (L-3).
- `as` assertions: **16** reviewed. Most are safe DOM or Radix narrowing; Q-2, Q-6 and Q-7 remove the avoidable ones.
- `console.*`: **4**, all `console.error` in server infrastructure (M-5 applies to one of them).

### Error-handling consistency

- **Server:** every action returns through `runAction` / `runActionData`, which map `AppError`, `ZodError`, P2002 and named DB constraints to Arabic messages with field errors. Nothing technical reaches the user.
- **Client:** `ActionForm` / `ActionButtons` show results consistently, and the `FlashProvider` keeps success messages visible after the form unmounts.
- **Gap:** the missing route-segment boundaries (A-6), and unstructured logging (A-8).

---

## Remediation status

Fixed 2026-09-27 on branch `sprint-5`. `npm run check` clean, all Vitest suites green, live Data API probe green.

| Finding | Fix | Verified by |
| --- | --- | --- |
| C-1 | Migration `20260927120000_lock_down_data_api`. It enables RLS on every `public` table and grants no policies. It revokes all table, sequence and function privileges from `anon` and `authenticated`, revokes `EXECUTE` from `PUBLIC`, and removes the default privileges. The app connects as the table owner, so its access is unchanged. The role-dependent part is skipped where the roles do not exist. | Applied to local Supabase: every table and `rpc/next_ref` now return `42501 permission denied` with the anon key. |
| L-4 | The test database now starts with Supabase's `anon`/`authenticated` roles and default grants. | `tests/integration/data-api-lockdown.test.ts` (fails without the migration: 4 of 5 checks). Live check: `tests/e2e/security.spec.ts`. |
| H-1 | `resolveClientIp()`: uses the platform header (`IP_HEADER`), else `X-Forwarded-For` counted from the right by `TRUSTED_PROXY_HOPS`. Invalid values go to one shared `unknown` bucket. | `tests/unit/security.test.ts` |
| H-2 | `chooseStore()`: in production without Upstash it throws (fail closed). `RATE_LIMIT_STORE=memory` is an explicit opt-in for local production builds. | `tests/unit/security.test.ts` |
| M-1 · M-2 | `organizationProfile()` in `lib/organizations.ts` (also the first step of A-1). The query itself omits emails for anyone without `organizations:manage`. Offers are filtered by `offers:read` scope, and none are read without it. | `tests/integration/organization-privacy.test.ts` |
| M-3 | Login failures are keyed on the account identifier only. Temporary exponential backoff (1 → 60 min), no permanent lock. | Code review; the auth actions run against Supabase and are covered by the existing E2E login flow. |
| M-4 | Password change needs the current password, except within 15 minutes of opening the email recovery link. That window is recorded server-side, because Supabase marks a recovery session `amr: otp`, the same as any one-time code, which was checked against local Supabase. The window is consumed on first use. Wrong current passwords count toward the same per-account backoff. | Code review; manual flow not yet covered by E2E. |
| M-5 | `lib/log.ts → logError()`: Prisma errors log class, code and model only. Other errors log one line, truncated, with emails and long digit runs redacted. Used by all four logging sites. | `tests/unit/security.test.ts` |

Not changed: the per-reference limit on `/track`. Access codes stay impractical to guess (about 40 bits, scrypt), and a per-reference limit would let anyone lock the real owner out of their own complaint.

## Recommended order

1. **C-1 now**, before any hosted deployment, together with L-4 so it stays fixed.
2. **H-1 and H-2**, alongside the hosting decision (Q14): both depend on the hosting platform.
3. **M-1 to M-5**: small, contained changes; M-1 and M-2 come with A-1 for the organization page.
4. **A-1, A-2 and A-6** during Sprint 5, since the reports and export work adds more scoped reads.
5. Quick wins opportunistically, file by file, as Sprint 5 touches them.
