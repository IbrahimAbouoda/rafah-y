-- نبض رفح — قيود ودوال لا يعبّر عنها Prisma (PRD §4.13)
-- يُلصق هذا الملف داخل أول migration يدوية بعد الـ migration المولَّدة من schema.prisma.
-- أسماء الجداول من @@map، وأسماء الأعمدة camelCase كما في المخطط (§4.1) لذلك تُقتبس.
-- 15 تعليمة.

-- ─────────────────────────────────────────────────────────────
-- 1) next_ref(): رقم مرجعي تسلسلي بلا تكرار تحت التزامن
--    INSERT … ON CONFLICT يقفل صف العدّاد حتى نهاية المعاملة، فلا يحصل طلبان متزامنان على نفس القيمة.
--    next_ref('CMP-2026')        → RF-CMP-2026-000124
--    next_ref('DEC-2026', 4)     → RF-DEC-2026-0012
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION next_ref(p_key text, p_width int DEFAULT 6)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_value int;
BEGIN
  INSERT INTO counters (key, value, "updatedAt")
  VALUES (p_key, 1, now())
  ON CONFLICT (key) DO UPDATE
    SET value = counters.value + 1,
        "updatedAt" = now()
  RETURNING value INTO v_value;

  RETURN 'RF-' || p_key || '-' || lpad(v_value::text, p_width, '0');
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2) و 3) سجل التدقيق إلحاقي فقط: لا UPDATE ولا DELETE ولا TRUNCATE
--    trigger على مستوى التعليمة ليغطي TRUNCATE أيضًا.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION audit_logs_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_logs
  FOR EACH STATEMENT
  EXECUTE FUNCTION audit_logs_block_mutation();

-- ─────────────────────────────────────────────────────────────
-- 4) الشكاوى: المجهولة بلا submitterId، والمستبعَدة بسبب مكتوب
-- ─────────────────────────────────────────────────────────────
ALTER TABLE complaints
  ADD CONSTRAINT complaints_anonymous_has_no_submitter
    CHECK (NOT "isAnonymous" OR "submitterId" IS NULL),
  ADD CONSTRAINT complaints_dismissed_needs_reason
    CHECK (status <> 'DISMISSED' OR length(btrim(coalesce("dismissReason", ''))) > 0);

-- ─────────────────────────────────────────────────────────────
-- 5) الملف يتبع سجلًّا واحدًا على الأكثر
--    ملاحظة: Agreement.fileId و ConceptNote.fileId يشيران إلى الملف من الطرف الآخر ولا يغطيهما هذا القيد.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE file_objects
  ADD CONSTRAINT files_single_owner
    CHECK (num_nonnulls(
      "complaintId", "ideaId", "initiativeId", "initiativeUpdateId",
      "opportunityId", "activityId", "taskId", "mediaPostId"
    ) <= 1);

-- ─────────────────────────────────────────────────────────────
-- 6) القيد المالي: المعتمِد ≠ المسجِّل، والمبلغ موجب
-- ─────────────────────────────────────────────────────────────
ALTER TABLE funding_records
  ADD CONSTRAINT funding_four_eyes
    CHECK ("approvedById" IS NULL OR "approvedById" <> "recordedById"),
  ADD CONSTRAINT funding_amount_positive
    CHECK (amount > 0),
  ADD CONSTRAINT funding_currency_allowed
    CHECK (currency IN ('ILS', 'USD'));

-- ─────────────────────────────────────────────────────────────
-- 7) لا اعتماد ذاتي للمهام
-- ─────────────────────────────────────────────────────────────
ALTER TABLE tasks
  ADD CONSTRAINT tasks_no_self_approval
    CHECK ("approvedById" IS NULL OR "assigneeId" IS NULL OR "approvedById" <> "assigneeId");

-- ─────────────────────────────────────────────────────────────
-- 8) دورة مجلس حالية واحدة فقط
-- ─────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX council_terms_one_current
  ON council_terms ((true))
  WHERE "isCurrent";

-- ─────────────────────────────────────────────────────────────
-- 9) و 10) رقم الاجتماع فريد في الدورة واللجنة — واجتماع المجلس العام (committeeId = NULL) يُعامَل كلجنة واحدة.
--    يستبدل فهرس @@unique المولَّد من Prisma بنفس الاسم، فلا يراه Prisma انحرافًا. يتطلب PostgreSQL 15+.
-- ─────────────────────────────────────────────────────────────
DROP INDEX "meetings_termId_committeeId_number_key";
CREATE UNIQUE INDEX "meetings_termId_committeeId_number_key"
  ON meetings ("termId", "committeeId", number)
  NULLS NOT DISTINCT;

-- ─────────────────────────────────────────────────────────────
-- 11) – 15) قيود النطاق
-- ─────────────────────────────────────────────────────────────
ALTER TABLE activity_registrations
  ADD CONSTRAINT activity_registrations_rating_range
    CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);

ALTER TABLE initiatives
  ADD CONSTRAINT initiatives_progress_range
    CHECK ("progressPct" BETWEEN 0 AND 100),
  ADD CONSTRAINT initiatives_budget_non_negative
    CHECK ("estimatedBudget" IS NULL OR "estimatedBudget" >= 0);

ALTER TABLE volunteer_hours
  ADD CONSTRAINT volunteer_hours_range
    CHECK (hours > 0 AND hours <= 24);

ALTER TABLE initiative_needs
  ADD CONSTRAINT initiative_needs_amount_positive
    CHECK (amount IS NULL OR amount > 0),
  ADD CONSTRAINT initiative_needs_quantity_positive
    CHECK (quantity IS NULL OR quantity > 0);

ALTER TABLE support_offers
  ADD CONSTRAINT support_offers_amount_positive
    CHECK (amount IS NULL OR amount > 0),
  ADD CONSTRAINT support_offers_currency_allowed
    CHECK (currency IN ('ILS', 'USD'));
