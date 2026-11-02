import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { memberOrganizationIds } from '@/lib/organizations';
import { guardPage } from '@/lib/page-guard';
import { OpportunityForm } from '@/components/opportunities/opportunity-form';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, Forbidden } from '@/components/shared/states';
import { Card, CardContent } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'فرصة جديدة' };

// /partner/opportunities/new — opportunities:create («خاص» = باسم مؤسسة ينتمي إليها المستخدم)
export default async function NewOpportunityPage() {
  const { user, allowed, backHref } = await guardPage('/partner/opportunities/new', 'opportunities:create');
  if (!allowed) return <Forbidden backHref={backHref} />;
  const orgIds = await memberOrganizationIds(db, user.id);
  const [orgs, areas, skills] = await Promise.all([
    db.organization.findMany({ where: { id: { in: orgIds } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.area.findMany({ orderBy: { nameAr: 'asc' }, select: { id: true, nameAr: true } }),
    db.skill.findMany({ orderBy: { nameAr: 'asc' }, select: { id: true, nameAr: true } }),
  ]);

  return (
    <>
      <PageHeader title="فرصة جديدة" description="تراجعها أمانة السر قبل نشرها. بيانات المتقدّمين تصلكم فقط ممن يوافق صراحة على مشاركة ملفه." />
      <Card>
        {orgs.length === 0 ? (
          <EmptyState title="حسابك غير مربوط بمؤسسة" hint="لا تُنشر فرصة إلا باسم مؤسسة. تواصل مع أمانة السر ليربط المجلس حسابك." />
        ) : (
          <CardContent className="pt-4 sm:pt-5">
            <OpportunityForm
              organizations={orgs}
              areas={areas.map((a) => ({ id: a.id, name: a.nameAr }))}
              skills={skills.map((s) => ({ id: s.id, name: s.nameAr }))}
            />
          </CardContent>
        )}
      </Card>
    </>
  );
}
