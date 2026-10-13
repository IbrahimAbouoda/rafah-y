import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMoney } from '@/lib/initiatives/workflow';
import { guardPage } from '@/lib/page-guard';
import { formatDate } from '@/lib/utils';
import { approveFundingAction, recordFundingAction } from '@/server/actions/funding';
import { ActionButtons } from '@/components/shared/action-buttons';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Input, Select, Textarea } from '@/components/ui/form-controls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';
import { financeLedger } from '@/lib/finance/queries';

export const metadata: Metadata = { title: 'السجل المالي' };

// /admin/finance — finance:read. التسجيل لأمين الصندوق (finance:record)، والاعتماد للرئيس (finance:approve)،
// ولا يعتمد أحد قيدًا سجّله (funding_four_eyes). D29: العروض المالية المقبولة تنتظر هنا تسجيل قيدها.
export default async function FinancePage() {
  const { user, allowed, backHref } = await guardPage('/admin/finance', 'finance:read');
  if (!allowed) return <Forbidden backHref={backHref} />;
  const ledger = await financeLedger(user);
  const { records, awaiting, initiatives } = ledger;
  const { record, approve } = ledger.can;
  const secured = Object.entries(ledger.secured);

  return (
    <>
      <PageHeader title="السجل المالي" description="كل حركة مالية بمسجّلها ومعتمدها. المبلغ المؤمَّن للمبادرات من القيود الواردة المعتمدة فقط." />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="flex flex-col gap-1 p-4">
          <p className="text-sm text-muted-foreground">وارد معتمد</p>
          <p className="text-lg font-semibold text-success">{secured.length ? secured.map(([c, v]) => formatMoney(v, c)).join(' + ') : 'لا بيانات بعد'}</p>
        </Card>
        <Card className="flex flex-col gap-1 p-4">
          <p className="text-sm text-muted-foreground">قيود بانتظار الاعتماد</p>
          <p className="text-2xl font-semibold text-warning">{records.filter((r) => !r.approvedAt).length}</p>
        </Card>
        <Card className="flex flex-col gap-1 p-4">
          <p className="text-sm text-muted-foreground">عروض مقبولة بلا قيد</p>
          <p className="text-2xl font-semibold">{awaiting.length}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <DataTable
          rows={records}
          rowKey={(r) => r.id}
          empty={{ title: 'لا قيود بعد', hint: 'يسجّل أمين الصندوق كل وارد ومصروف، ويعتمده الرئيس.' }}
          columns={[
            {
              key: 'what',
              header: 'الحركة',
              cell: (r) => (
                <span className="flex flex-col">
                  <span className={r.direction === 'INCOMING' ? 'font-medium text-success' : 'font-medium'}>
                    {r.direction === 'INCOMING' ? '+' : '−'} {formatMoney(r.amount, r.currency)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.initiative ? (
                      <Link href={`/admin/initiatives/${r.initiative.id}`} className="hover:underline">
                        {r.initiative.title}
                      </Link>
                    ) : (
                      'بلا مبادرة'
                    )}
                    {r.organization ? ` · ${r.organization.name}` : ''}
                    {r.description ? ` · ${r.description}` : ''}
                  </span>
                </span>
              ),
            },
            { key: 'date', header: 'التاريخ', className: 'hidden sm:table-cell', cell: (r) => formatDate(r.occurredAt) },
            {
              key: 'by',
              header: 'المسجِّل · المعتمِد',
              className: 'hidden md:table-cell',
              cell: (r) => `${r.recordedBy.fullName} · ${r.approvedBy?.fullName ?? '—'}`,
            },
            {
              key: 'status',
              header: 'الحالة',
              cell: (r) =>
                r.approvedAt ? (
                  <StatusBadge kind="funding" status="approved" />
                ) : approve && r.recordedById !== user.id ? (
                  <ActionButtons items={[{ action: approveFundingAction, fields: { fundingId: r.id }, label: 'اعتماد', variant: 'default' }]} />
                ) : (
                  <StatusBadge kind="funding" status="pending" />
                ),
            },
          ]}
        />

        {record ? (
          <div className="flex flex-col gap-4">
            {awaiting.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>عروض مقبولة بانتظار قيدها</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {awaiting.map((o) => (
                    <ActionForm key={o.id} action={recordFundingAction} className="gap-2 rounded-lg border p-3 text-sm">
                      <p>
                        <strong>{o.organization.name}</strong> — {formatMoney(o.amount!, o.currency)} لمبادرة «{o.initiative.title}»
                      </p>
                      <input type="hidden" name="offerId" value={o.id} />
                      <input type="hidden" name="direction" value="INCOMING" />
                      <div className="grid grid-cols-2 gap-2">
                        <Field name="amount" label="المبلغ الواصل">
                          <Input defaultValue={o.amount!.toString()} inputMode="decimal" dir="ltr" />
                        </Field>
                        <Field name="occurredAt" label="تاريخ الوصول">
                          <Input type="date" />
                        </Field>
                      </div>
                      <SubmitButton size="sm">تسجيل القيد</SubmitButton>
                    </ActionForm>
                  ))}
                </CardContent>
              </Card>
            ) : null}
            <Card>
              <CardHeader>
                <CardTitle>قيد جديد</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={recordFundingAction} resetOnSuccess>
                  <div className="grid grid-cols-2 gap-3">
                    <Field name="direction" label="الاتجاه">
                      <Select defaultValue="INCOMING">
                        <option value="INCOMING">وارد</option>
                        <option value="OUTGOING">مصروف</option>
                      </Select>
                    </Field>
                    <Field name="currency" label="العملة">
                      <Select defaultValue="ILS">
                        <option value="ILS">شيكل</option>
                        <option value="USD">دولار</option>
                      </Select>
                    </Field>
                    <Field name="amount" label="المبلغ">
                      <Input inputMode="decimal" dir="ltr" />
                    </Field>
                    <Field name="occurredAt" label="التاريخ">
                      <Input type="date" />
                    </Field>
                  </div>
                  {initiatives.length > 0 ? (
                    <Field name="initiativeId" label="المبادرة (اختيارية)">
                      <Select defaultValue="">
                        <option value="">— بلا مبادرة —</option>
                        {initiatives.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.title}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : null}
                  <Field name="description" label="البيان">
                    <Textarea rows={2} maxLength={1000} />
                  </Field>
                  <SubmitButton>تسجيل</SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
