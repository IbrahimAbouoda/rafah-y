import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { guardPage } from '@/lib/page-guard';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, Forbidden } from '@/components/shared/states';
import { Card } from '@/components/ui/surface';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

export const metadata: Metadata = { title: 'الأدوار وصلاحياتها' };

const SCOPE_LABEL = { ALL: 'الكل', COMMITTEE: 'لجنة', OWN: 'خاص' } as const;
const SCOPE_CLASS = { ALL: 'text-brand font-medium', COMMITTEE: 'text-council-green-dark dark:text-accent font-medium', OWN: 'text-info' } as const;

// المصفوفة تُقرأ من قاعدة البيانات لا من الكود: ما يُعرض هنا هو ما يُطبَّق فعلًا.
export default async function RolesPage() {
  const { allowed, backHref } = await guardPage('/admin/settings/roles', 'users:manage_roles');
  if (!allowed) return <Forbidden backHref={backHref} />;

  const [roles, permissions] = await Promise.all([
    db.role.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        nameAr: true,
        requiresCommittee: true,
        permissions: { select: { permissionId: true, scope: true } },
        _count: { select: { permissions: true } },
      },
    }),
    db.permission.findMany({ orderBy: { key: 'asc' }, select: { id: true, key: true, descriptionAr: true, isPhase2: true } }),
  ]);

  const grant = new Map<string, keyof typeof SCOPE_LABEL>();
  for (const r of roles) for (const p of r.permissions) grant.set(`${r.id}|${p.permissionId}`, p.scope);

  return (
    <>
      <PageHeader
        title="الأدوار وصلاحياتها"
        description="مصفوفة الصلاحيات المطبَّقة فعلًا. «الكل» = كل السجلات · «لجنة» = سجلات لجانه في الدورة الحالية · «خاص» = ما أنشأه أو أُسند إليه. صلاحيات (م٢) للمرحلة الثانية."
      />
      {roles.length === 0 || permissions.length === 0 ? (
        <Card>
          <EmptyState title="المصفوفة غير مزروعة" hint="شغّل أمر البذرة (npx prisma db seed) لتحميل الأدوار والصلاحيات من prisma/rbac.seed.ts." />
        </Card>
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH className="sticky start-0 z-10 bg-muted">الصلاحية</TH>
                {roles.map((r) => (
                  <TH key={r.id} className="text-center">
                    <span className="block">{r.nameAr}</span>
                    <span className="block text-xs font-normal">{r._count.permissions}</span>
                  </TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {permissions.map((p) => (
                <TR key={p.id}>
                  <TD className="sticky start-0 z-10 min-w-56 bg-surface">
                    <code className="text-xs" dir="ltr">
                      {p.key}
                    </code>
                    <span className="block text-xs text-muted-foreground">
                      {p.descriptionAr}
                      {p.isPhase2 ? ' (م٢)' : ''}
                    </span>
                  </TD>
                  {roles.map((r) => {
                    const scope = grant.get(`${r.id}|${p.id}`);
                    return (
                      <TD key={r.id} className="text-center">
                        {scope ? <span className={SCOPE_CLASS[scope]}>{SCOPE_LABEL[scope]}</span> : <span className="text-muted-foreground" aria-label="ممنوع">—</span>}
                      </TD>
                    );
                  })}
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
