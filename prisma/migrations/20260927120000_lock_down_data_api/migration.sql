-- C-1 (docs/code-and-security-audit.md): إغلاق واجهة Supabase Data API (PostgREST) أمام anon و authenticated.
-- التطبيق لا يستخدم PostgREST لجداوله: يتصل عبر Prisma بدور مالك الجداول (postgres)، والمالك يتجاوز RLS
-- (بلا FORCE)، فلا يتغيّر شيء في سلوك التطبيق. التخزين (schema storage) لا يتأثر.
--
-- 1) RLS على كل جداول public بلا أي policy ⇒ رفض لكل دور غير المالك (دفاع في العمق).
-- 2) سحب كل الصلاحيات الممنوحة لـ anon و authenticated (و EXECUTE من PUBLIC على الدوال) — على Supabase فقط:
--    PGlite في الاختبارات لا يعرف هذين الدورين إلا إن أنشأتهما تهيئة الاختبار.
-- 3) سحب الصلاحيات الافتراضية كي لا يُفتح أي جدول جديد تلقائيًا. RLS لا يُفعَّل تلقائيًا على جدول جديد:
--    اختبار tests/integration/data-api-lockdown.test.ts يفشل إن وُجد جدول بلا RLS.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END
$$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END
$$;
