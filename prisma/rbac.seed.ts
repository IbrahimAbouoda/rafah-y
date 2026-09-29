// الأدوار والصلاحيات والمنح — مصدر الحقيقة لمصفوفة PRD §3.3.
// المصفوفة أدناه مولَّدة آليًا من جدول §3.3 (10 أدوار × 70 صلاحية = 205 منحة).
// إضافة صلاحية = تعديل هذا الملف + تحديث PRD §3.3 + migration للـ seed، ثلاثتها معًا (§3.1 قاعدة 5).
import type { PrismaClient } from '../lib/generated/prisma/client';

type Scope = 'OWN' | 'COMMITTEE' | 'ALL';

export const ROLES = [
  // افتراض: قيم isTermBound و isSystem غير منصوصة في PRD
  { key: 'super_admin', nameAr: 'المدير التقني', requiresCommittee: false, isTermBound: false, isSystem: true },
  { key: 'council_president', nameAr: 'رئيس المجلس', requiresCommittee: false, isTermBound: true, isSystem: true },
  { key: 'vice_president', nameAr: 'نائب الرئيس', requiresCommittee: false, isTermBound: true, isSystem: true },
  { key: 'secretary', nameAr: 'أمين السر', requiresCommittee: false, isTermBound: true, isSystem: true },
  { key: 'treasurer', nameAr: 'أمين الصندوق', requiresCommittee: false, isTermBound: true, isSystem: true },
  { key: 'committee_head', nameAr: 'رئيس اللجنة', requiresCommittee: true, isTermBound: true, isSystem: true },
  { key: 'committee_member', nameAr: 'عضو اللجنة', requiresCommittee: true, isTermBound: true, isSystem: true },
  { key: 'municipality_observer', nameAr: 'مراقب البلدية', requiresCommittee: false, isTermBound: false, isSystem: true },
  { key: 'partner', nameAr: 'مؤسسة شريكة', requiresCommittee: false, isTermBound: false, isSystem: true },
  { key: 'youth', nameAr: 'شاب', requiresCommittee: false, isTermBound: false, isSystem: true },
] as const;

export type RoleKey = (typeof ROLES)[number]['key'];

type PermissionDef = {
  key: `${string}:${string}`;
  descriptionAr: string;
  isPhase2?: boolean;
  grants: Partial<Record<RoleKey, Scope>>;
};

export const PERMISSIONS = [
  { key: 'complaints:create', descriptionAr: 'تقديم شكوى', grants: { youth: 'OWN' } },
  { key: 'complaints:read', descriptionAr: 'عرض الشكاوى وتفاصيلها (بلا بيانات التواصل)', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL', committee_head: 'COMMITTEE', committee_member: 'COMMITTEE', municipality_observer: 'ALL', youth: 'OWN' } },
  { key: 'complaints:read_contact', descriptionAr: 'عرض بيانات التواصل المشفّرة لمقدّم الشكوى', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL', committee_head: 'COMMITTEE' } },
  { key: 'complaints:triage', descriptionAr: 'فرز الوارد وتحويله إلى لجنة', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL' } },
  { key: 'complaints:update_status', descriptionAr: 'تحديث حالة الشكوى في مسارها', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL', committee_head: 'COMMITTEE' } },
  { key: 'complaints:refer', descriptionAr: 'تحويل لجهة خارجية (بلدية، مؤسسة…)', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL', committee_head: 'COMMITTEE' } },
  { key: 'complaints:close', descriptionAr: 'إغلاق الشكوى أو استبعادها بسبب مكتوب', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL', committee_head: 'COMMITTEE' } },
  { key: 'complaints:export', descriptionAr: 'تصدير سجل الشكاوى', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL' } },
  { key: 'ideas:create', descriptionAr: 'تقديم فكرة', grants: { youth: 'OWN' } },
  { key: 'ideas:vote', descriptionAr: 'التصويت على فكرة', grants: { youth: 'OWN' } },
  { key: 'ideas:read_internal', descriptionAr: 'عرض ملاحظات المراجعة الداخلية', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL', committee_head: 'COMMITTEE', committee_member: 'COMMITTEE', municipality_observer: 'ALL' } },
  { key: 'ideas:review', descriptionAr: 'فرز الفكرة وإحالتها وطلب تعديلها', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL', committee_head: 'COMMITTEE' } },
  { key: 'ideas:approve', descriptionAr: 'اعتماد الفكرة أو رفضها نهائيًا', grants: { council_president: 'ALL' } },
  { key: 'ideas:merge', descriptionAr: 'دمج فكرتين متشابهتين', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL' } },
  { key: 'demand:vote', descriptionAr: 'التصويت على مجالات التدريب', grants: { youth: 'OWN' } },
  { key: 'demand:manage', descriptionAr: 'إنشاء استطلاع طلب وتحديد حدّ المقترح', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL' } },
  { key: 'concept_notes:approve', descriptionAr: 'اعتماد مسودة Concept Note قبل إرسالها', grants: { council_president: 'ALL' } },
  { key: 'initiatives:create', descriptionAr: 'إنشاء مبادرة', grants: { council_president: 'ALL', committee_head: 'COMMITTEE' } },
  { key: 'initiatives:update', descriptionAr: 'تعديل المبادرة ونسبة الإنجاز', grants: { council_president: 'ALL', vice_president: 'ALL', committee_head: 'COMMITTEE' } },
  { key: 'initiatives:manage_needs', descriptionAr: 'إدارة الاحتياجات المرقّمة', grants: { council_president: 'ALL', vice_president: 'ALL', committee_head: 'COMMITTEE' } },
  { key: 'initiatives:approve', descriptionAr: 'اعتماد المبادرة ونشرها للعامة', grants: { council_president: 'ALL' } },
  { key: 'initiatives:post_update', descriptionAr: 'نشر تحديث ميداني عن المبادرة', grants: { council_president: 'ALL', vice_president: 'ALL', committee_head: 'COMMITTEE', committee_member: 'COMMITTEE' } },
  { key: 'offers:create', descriptionAr: 'تقديم عرض دعم', grants: { partner: 'OWN' } },
  { key: 'offers:read', descriptionAr: 'عرض عروض الدعم', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL', treasurer: 'ALL', committee_head: 'COMMITTEE', municipality_observer: 'ALL', partner: 'OWN' } },
  { key: 'offers:decide', descriptionAr: 'قبول عرض الدعم أو رفضه', grants: { council_president: 'ALL' } },
  { key: 'organizations:read', descriptionAr: 'عرض سجل المؤسسات', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL', treasurer: 'ALL', committee_head: 'ALL', committee_member: 'ALL', municipality_observer: 'ALL', partner: 'OWN' } },
  { key: 'organizations:manage', descriptionAr: 'إضافة مؤسسة وتعديل مرحلة الشراكة', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL' } },
  { key: 'organizations:log', descriptionAr: 'تسجيل تواصل أو اجتماع مع مؤسسة', grants: { council_president: 'OWN', vice_president: 'OWN', secretary: 'OWN', committee_head: 'OWN', committee_member: 'OWN' } },
  { key: 'opportunities:create', descriptionAr: 'نشر فرصة (تدخل المراجعة)', grants: { partner: 'OWN' } },
  { key: 'opportunities:publish', descriptionAr: 'اعتماد الفرصة ونشرها', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL' } },
  { key: 'opportunities:apply', descriptionAr: 'التقديم على فرصة', grants: { youth: 'OWN' } },
  { key: 'opportunities:applicants', descriptionAr: 'عرض المتقدمين (بموافقتهم فقط)', grants: { council_president: 'ALL', partner: 'OWN' } },
  { key: 'activities:create', descriptionAr: 'إنشاء نشاط أو ورشة', grants: { council_president: 'ALL', secretary: 'ALL', committee_head: 'COMMITTEE' } },
  { key: 'activities:update', descriptionAr: 'تعديل النشاط ونشره', grants: { council_president: 'ALL', secretary: 'ALL', committee_head: 'COMMITTEE' } },
  { key: 'activities:register', descriptionAr: 'التسجيل في نشاط وتقييمه', grants: { partner: 'OWN', youth: 'OWN' } },
  { key: 'activities:attendance', descriptionAr: 'تسجيل الحضور', grants: { committee_head: 'COMMITTEE', committee_member: 'COMMITTEE' } },
  { key: 'tasks:read', descriptionAr: 'عرض المهام', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL', treasurer: 'OWN', committee_head: 'COMMITTEE', committee_member: 'COMMITTEE', municipality_observer: 'ALL' } },
  { key: 'tasks:create', descriptionAr: 'إنشاء مهمة وإسنادها', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL', committee_head: 'COMMITTEE' } },
  { key: 'tasks:update', descriptionAr: 'تحديث حالة المهمة حتى «مراجعة»', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL', treasurer: 'OWN', committee_head: 'COMMITTEE', committee_member: 'OWN' } },
  { key: 'tasks:approve', descriptionAr: 'اعتماد المهمة المنجزة وإغلاقها', grants: { council_president: 'ALL', vice_president: 'ALL', committee_head: 'COMMITTEE' } },
  { key: 'tasks:comment', descriptionAr: 'إضافة ملاحظة متابعة', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL', treasurer: 'OWN', committee_head: 'COMMITTEE', committee_member: 'COMMITTEE' } },
  { key: 'committees:read', descriptionAr: 'عرض لوحة اللجنة وأعضائها', grants: { super_admin: 'ALL', council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL', treasurer: 'ALL', committee_head: 'COMMITTEE', committee_member: 'COMMITTEE', municipality_observer: 'ALL' } },
  { key: 'committees:manage', descriptionAr: 'إنشاء لجنة وتعديل مجالها', grants: { super_admin: 'ALL' } },
  { key: 'finance:read', descriptionAr: 'عرض السجل المالي', grants: { council_president: 'ALL', vice_president: 'ALL', treasurer: 'ALL', municipality_observer: 'ALL' } },
  { key: 'finance:record', descriptionAr: 'تسجيل تمويل وارد أو مصروف', grants: { treasurer: 'ALL' } },
  { key: 'finance:approve', descriptionAr: 'اعتماد القيد المالي', grants: { council_president: 'ALL' } },
  { key: 'profiles:update', descriptionAr: 'تعديل الملف الشخصي والمهارات والموافقات', grants: { youth: 'OWN' } },
  { key: 'profiles:read_consented', descriptionAr: 'البحث في ملفات الشباب الموافقين على المشاركة', isPhase2: true, grants: { partner: 'ALL' } },
  { key: 'reports:read', descriptionAr: 'عرض التقارير والمؤشرات الداخلية', grants: { super_admin: 'ALL', council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL', treasurer: 'ALL', committee_head: 'ALL', municipality_observer: 'ALL' } },
  // D35 (2026-09-28): توليد لقطة التقرير منفصل عن القراءة — مراقب البلدية يقرأ ويصدّر ولا يولّد (AC-14)
  { key: 'reports:create', descriptionAr: 'توليد تقرير (لقطة مؤشرات لفترة)', grants: { super_admin: 'ALL', council_president: 'ALL', secretary: 'ALL' } },
  { key: 'reports:export', descriptionAr: 'تصدير التقارير', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL', treasurer: 'ALL', municipality_observer: 'ALL' } },
  { key: 'reports:publish', descriptionAr: 'نشر تقرير في صفحة الشفافية', grants: { council_president: 'ALL' } },
  { key: 'audit:read', descriptionAr: 'عرض سجل التدقيق', grants: { super_admin: 'ALL', council_president: 'ALL', vice_president: 'ALL' } },
  { key: 'users:manage_roles', descriptionAr: 'تعيين الأدوار وسحبها وإدارة الدورات', grants: { super_admin: 'ALL', council_president: 'ALL' } },
  { key: 'settings:manage', descriptionAr: 'التصنيفات والمناطق وإعدادات النظام', grants: { super_admin: 'ALL' } },
  { key: 'meetings:read', descriptionAr: 'عرض الاجتماعات والمحاضر', isPhase2: true, grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL', treasurer: 'ALL', committee_head: 'COMMITTEE', committee_member: 'COMMITTEE', municipality_observer: 'ALL' } },
  { key: 'meetings:manage', descriptionAr: 'جدولة الاجتماع وتسجيل الحضور والمحضر', isPhase2: true, grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL', committee_head: 'COMMITTEE' } },
  { key: 'decisions:create', descriptionAr: 'إصدار قرار مرقّم', isPhase2: true, grants: { council_president: 'ALL', secretary: 'ALL' } },
  { key: 'media:create', descriptionAr: 'كتابة مسودة خبر أو بيان', isPhase2: true, grants: { committee_head: 'COMMITTEE', committee_member: 'COMMITTEE' } },
  { key: 'media:review', descriptionAr: 'المراجعة الداخلية', isPhase2: true, grants: { committee_head: 'COMMITTEE' } },
  { key: 'media:approve_committee', descriptionAr: 'موافقة لجنة الإعلام', isPhase2: true, grants: { committee_head: 'COMMITTEE' } },
  { key: 'media:approve_final', descriptionAr: 'الموافقة النهائية والنشر', isPhase2: true, grants: { council_president: 'ALL' } },
  { key: 'volunteer:log', descriptionAr: 'تسجيل ساعات تطوع', isPhase2: true, grants: { youth: 'OWN' } },
  { key: 'volunteer:approve', descriptionAr: 'اعتماد ساعات التطوع', isPhase2: true, grants: { committee_head: 'COMMITTEE' } },
  { key: 'volunteer:certify', descriptionAr: 'إصدار شهادة', isPhase2: true, grants: { council_president: 'ALL' } },
  { key: 'ai:use', descriptionAr: 'طلب اقتراح من المساعد الذكي وقبوله', isPhase2: true, grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL', committee_head: 'COMMITTEE' } },
  { key: 'support:ask', descriptionAr: 'إرسال استفسار للبوت أو لفريق المجلس', grants: { youth: 'OWN' } },
  { key: 'support:read', descriptionAr: 'عرض الاستفسارات الواردة ولوحة الدعم', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL' } },
  { key: 'support:respond', descriptionAr: 'الرد على استفسار وإسناده وإغلاقه', grants: { council_president: 'ALL', vice_president: 'ALL', secretary: 'ALL' } },
  { key: 'faq:manage', descriptionAr: 'إنشاء وتعديل وتعطيل أسئلة FAQ المعتمدة', grants: { council_president: 'ALL', secretary: 'ALL' } },
] as const satisfies readonly PermissionDef[];

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

/**
 * يزرع الأدوار والصلاحيات والمنح. آمن للتكرار (upsert).
 * يحذف منح الأدوار النظامية التي لم تعد في المصفوفة، فتبقى قاعدة البيانات مطابقة لهذا الملف.
 * الأدوار غير النظامية (مثل support_officer — Q9) لا يمسّها.
 */
export async function seedRbac(db: PrismaClient): Promise<void> {
  await db.$transaction(
    async (tx) => {
      const roleIds = new Map<RoleKey, string>();
      for (const role of ROLES) {
        const row = await tx.role.upsert({
          where: { key: role.key },
          create: { ...role },
          update: {
            nameAr: role.nameAr,
            requiresCommittee: role.requiresCommittee,
            isTermBound: role.isTermBound,
            isSystem: role.isSystem,
          },
        });
        roleIds.set(role.key, row.id);
      }

      const expected = new Set<string>();
      for (const perm of PERMISSIONS as readonly PermissionDef[]) {
        const sep = perm.key.indexOf(':');
        const resource = perm.key.slice(0, sep);
        const action = perm.key.slice(sep + 1);
        const isPhase2 = perm.isPhase2 ?? false;
        const row = await tx.permission.upsert({
          where: { key: perm.key },
          create: { key: perm.key, resource, action, descriptionAr: perm.descriptionAr, isPhase2 },
          update: { descriptionAr: perm.descriptionAr, isPhase2 },
        });
        for (const [roleKey, scope] of Object.entries(perm.grants) as [RoleKey, Scope][]) {
          const roleId = roleIds.get(roleKey)!;
          expected.add(`${roleId}|${row.id}`);
          await tx.rolePermission.upsert({
            where: { roleId_permissionId: { roleId, permissionId: row.id } },
            create: { roleId, permissionId: row.id, scope },
            update: { scope },
          });
        }
      }

      const existing = await tx.rolePermission.findMany({
        where: { roleId: { in: [...roleIds.values()] } },
        select: { roleId: true, permissionId: true },
      });
      for (const grant of existing) {
        if (!expected.has(`${grant.roleId}|${grant.permissionId}`)) {
          await tx.rolePermission.delete({ where: { roleId_permissionId: grant } });
        }
      }
    },
    { timeout: 60_000 },
  );
}
