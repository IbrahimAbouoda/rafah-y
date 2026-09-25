import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { guardPage } from '@/lib/page-guard';
import { can } from '@/lib/rbac';
import { formatDate } from '@/lib/utils';
import { ORG_TYPE_LABELS, STAGE_LABELS } from '@/lib/organization-labels';
import { ORGANIZATION_TYPES } from '@/lib/validation/initiatives';
import { saveOrganizationAction } from '@/server/actions/organizations';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { Input, Select } from '@/components/ui/form-controls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'المؤسسات' };

// /admin/organizations — organizations:read (الكل لأعضاء المجلس واللجان). الإضافة لـ organizations:manage.
export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { user, allowed, backHref } = await guardPage('/admin/organizations', 'organizations:read', { beyondOwn: true });
  if (!allowed) return <Forbidden backHref={backHref} />;
  const query = q?.trim() ?? '';
  const orgs = await db.organization.findMany({
    where: query ? { name: { contains: query, mode: 'insensitive' } } : {},
    orderBy: [{ lastContactAt: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
    take: 200,
    select: { id: true, name: true, type: true, stage: true, lastContactAt: true, _count: { select: { offers: true, members: true } } },
  });
  const manage = can(user, 'organizations:manage');

  return (
    <>
      <PageHeader title="سجل المؤسسات" description="المؤسسات الشريكة والمحتملة، ومرحلة كل شراكة، وآخر تواصل معها." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <DataTable
          rows={orgs}
          rowKey={(o) => o.id}
          search={{ name: 'q', value: query, placeholder: 'ابحث باسم المؤسسة', action: '/admin/organizations' }}
          empty={
            query
              ? { title: 'لا نتائج', hint: 'جرّب جزءًا من الاسم.' }
              : { title: 'لا مؤسسات بعد', hint: 'أضف المؤسسات التي تتواصل معها لجنة المؤسسات والشراكات.' }
          }
          columns={[
            {
              key: 'name',
              header: 'المؤسسة',
              cell: (o) => (
                <Link href={`/admin/organizations/${o.id}`} className="font-medium text-brand hover:underline">
                  {o.name}
                </Link>
              ),
            },
            { key: 'type', header: 'النوع', className: 'hidden md:table-cell', cell: (o) => ORG_TYPE_LABELS[o.type] },
            { key: 'stage', header: 'المرحلة', cell: (o) => STAGE_LABELS[o.stage] },
            { key: 'offers', header: 'عروض', className: 'hidden sm:table-cell', cell: (o) => o._count.offers },
            { key: 'last', header: 'آخر تواصل', className: 'hidden sm:table-cell', cell: (o) => formatDate(o.lastContactAt) },
          ]}
        />
        {manage ? (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>إضافة مؤسسة</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={saveOrganizationAction} resetOnSuccess>
                <Field name="name" label="الاسم">
                  <Input maxLength={200} />
                </Field>
                <Field name="type" label="النوع">
                  <Select defaultValue="">
                    <option value="">— اختر —</option>
                    {ORGANIZATION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ORG_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field name="country" label="الدولة (اختيارية)">
                  <Input maxLength={100} />
                </Field>
                <Field name="sectors" label="القطاعات (اختيارية)" hint="افصل بفاصلة: تعليم، صحة، تمكين اقتصادي">
                  <Input />
                </Field>
                <Field name="website" label="الموقع (اختياري)">
                  <Input dir="ltr" placeholder="https://" />
                </Field>
                <SubmitButton>إضافة</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
