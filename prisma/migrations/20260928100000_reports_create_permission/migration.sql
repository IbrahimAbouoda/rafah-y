-- D35: صلاحية reports:create لتوليد لقطة التقرير (§3.1 قاعدة 5: الـ seed + PRD §3.3 + migration معًا).
-- على قاعدة جديدة لا أدوار بعد، فلا تُدرج منح هنا وتنشئها البذرة (prisma/rbac.seed.ts)؛ على قاعدة قائمة تُنشأ المنح الثلاث.
INSERT INTO "permissions" ("id", "key", "resource", "action", "descriptionAr", "isPhase2")
VALUES (gen_random_uuid(), 'reports:create', 'reports', 'create', 'توليد تقرير (لقطة مؤشرات لفترة)', false)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId", "scope")
SELECT r."id", p."id", 'ALL'::"PermissionScope"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE p."key" = 'reports:create'
  AND r."key" IN ('super_admin', 'council_president', 'secretary')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
