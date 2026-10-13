-- نبض رفح — إغلاق Data API في Supabase (اقتراح D32 — sprints/mobile.md)
--
-- الصلاحيات كلها في طبقة التطبيق (can() — PRD §6.2)، والتطبيق يتصل بقاعدة البيانات كمالك الجداول عبر Prisma.
-- لكن Supabase يكشف مخطط public عبر PostgREST لدوري anon و authenticated، ومفتاح anon علني بطبيعته
-- (في حزمة الويب، وفي تطبيق الجوّال). بلا هذا الملف يقرأ أي حامل للمفتاح الجداول مباشرة متجاوزًا can().
--
-- 1) سحب كل امتياز على الجداول والتسلسلات والدوال من anon و authenticated، ومن الامتيازات الافتراضية للجديد منها.
-- 2) EXECUTE على الدوال لا يبقى لـ PUBLIC (next_ref وغيرها للمالك فقط).
-- 3) RLS مفعّل على كل جدول بلا سياسات: طبقة ثانية إن مُنح امتياز خطأً لاحقًا. المالك (اتصال Prisma) يتجاوزها.
--
-- آمن على قاعدة بلا هذين الدورين (PGlite في الاختبارات): كل سحب مشروط بوجود الدور.
-- لا يمسّ مخطط auth ولا storage: الرفع بالروابط الموقّعة يمرّ عبر Storage API لا عبر هذه الجداول.

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
END $$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
