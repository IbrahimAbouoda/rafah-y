import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { OFFERABLE_INITIATIVE_STATUSES, OPEN_NEED_STATUSES } from '@/lib/initiatives/workflow';
import { memberOrganizationIds } from '@/lib/organizations';
import { guardPage } from '@/lib/page-guard';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, Forbidden } from '@/components/shared/states';
import { StatTile } from '@/components/shared/stat-tile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'لوحة المؤسسة' };

// /partner — «دور مؤسسة» (§11.2). كل الأرقام من مؤسسات المستخدم وحدها (D27).
export default async function PartnerHome() {
  const { user, allowed, backHref } = await guardPage('/partner', 'offers:create');
  if (!allowed) return <Forbidden backHref={backHref} />;
  const orgIds = await memberOrganizationIds(db, user.id);

  const [orgs, pending, accepted, openNeeds] = await Promise.all([
    db.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true, stage: true } }),
    db.supportOffer.count({ where: { organizationId: { in: orgIds }, status: 'SUBMITTED' } }),
    db.supportOffer.count({ where: { organizationId: { in: orgIds }, status: 'ACCEPTED' } }),
    db.initiativeNeed.count({
      where: { status: { in: OPEN_NEED_STATUSES }, initiative: { status: { in: OFFERABLE_INITIATIVE_STATUSES } } },
    }),
  ]);

  return (
    <>
      <PageHeader title={orgs.length === 1 ? orgs[0]!.name : 'لوحة المؤسسة'} description="احتياجات مبادرات الشباب المرقّمة، وعروض دعمكم وقرارات المجلس عليها." />
      {orgs.length === 0 ? (
        <Card>
          <EmptyState title="حسابك غير مربوط بمؤسسة" hint="يربط المجلس حساب ممثل المؤسسة بها. تواصل مع أمانة السر عبر info.rafahyouth@gmail.com." />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="احتياجات مفتوحة" value={openNeeds} tone="brand" href="/partner/needs" />
            <StatTile label="عروض بانتظار القرار" value={pending} tone="warning" href="/partner/offers" />
            <StatTile label="عروض مقبولة" value={accepted} tone="success" href="/partner/offers" />
          </div>
          <Card className="mt-5">
            <CardHeader>
              <CardTitle>كيف يعمل الدعم؟</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
              <p>
                لكل مبادرة احتياجات مرقّمة بنوعها وكميتها ومبلغها. اختر ما تستطيع تغطيته — مالًا أو مدرّبًا أو مكانًا أو معدات — وأرسل عرضك.
                يقرّر رئيس المجلس، وتُضاف مؤسستكم شريكًا عند القبول.
              </p>
              <Button asChild className="self-start">
                <Link href="/partner/needs">تصفّح الاحتياجات</Link>
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
