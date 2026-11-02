import type { Metadata } from 'next';
import Link from 'next/link';
import { CURRENCIES } from '@/lib/config';
import { EXPENSE_CATEGORIES } from '@/lib/finance/totals';
import { formatMoney } from '@/lib/initiatives/workflow';
import { guardPage } from '@/lib/page-guard';
import { formatDate } from '@/lib/utils';
import { approveFundingAction, deleteFundingAction, recordFundingAction, updateFundingAction } from '@/server/actions/funding';
import { ActionButtons } from '@/components/shared/action-buttons';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/form-controls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';
import { financeLedger } from '@/lib/finance/queries';

export const metadata: Metadata = { title: 'السجل المالي' };

const CURRENCY_LABELS = { ILS: '₪ شيكل', USD: '$ دولار' } as const;

type Ledger = Awaited<ReturnType<typeof financeLedger>>;
type Entry = Ledger['records'][number];

function TotalCard({ label, value, tone, pending }: { label: string; value: string; tone?: string; pending?: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${tone ?? ''}`}>{value}</p>
      {pending ? <p className="text-xs text-warning">+ {pending} بانتظار الاعتماد</p> : null}
    </Card>
  );
}

/** حقول القيد المشتركة بين التسجيل والتعديل */
function EntryFields({ entry, initiatives, organizations }: { entry?: Entry; initiatives: Ledger['initiatives']; organizations: Ledger['organizations'] }) {
  const fromOffer = Boolean(entry?.offerId);
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field name="direction" label="الاتجاه" hint={fromOffer ? 'قيد عرض الدعم وارد دائمًا.' : undefined}>
          <Select defaultValue={entry?.direction ?? 'INCOMING'}>
            <option value="INCOMING">وارد</option>
            {fromOffer ? null : <option value="OUTGOING">مصروف</option>}
          </Select>
        </Field>
        <Field name="currency" label="العملة" hint={fromOffer ? 'عملة العرض ثابتة.' : undefined}>
          <Select defaultValue={entry?.currency ?? 'ILS'}>
            <option value="ILS">شيكل</option>
            <option value="USD">دولار</option>
          </Select>
        </Field>
        <Field name="amount" label="المبلغ">
          <Input defaultValue={entry?.amount.toString()} inputMode="decimal" dir="ltr" />
        </Field>
        <Field name="occurredAt" label="التاريخ">
          <Input type="date" defaultValue={entry?.occurredAt.toISOString().slice(0, 10)} />
        </Field>
      </div>
      {organizations.length > 0 && !fromOffer ? (
        <Field name="organizationId" label="المؤسسة (اختيارية)" hint="اسم المؤسسة المختارة يظهر للعامة في صفحة الشفافية المالية بعد اعتماد القيد.">
          <Select defaultValue={entry?.organizationId ?? ''}>
            <option value="">— بلا مؤسسة —</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field name="counterparty" label="الجهة (مصدر الوارد أو المستفيد من المصروف)" hint="لفرد أو جهة غير مسجّلة. لا يظهر هذا الاسم للعامة.">
        <Input defaultValue={entry?.counterparty ?? ''} maxLength={200} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field name="category" label="بند المصروف">
          <Input defaultValue={entry?.category ?? ''} list="expense-categories" maxLength={100} />
        </Field>
        <Field name="documentNumber" label="رقم المستند / الإيصال">
          <Input defaultValue={entry?.documentNumber ?? ''} dir="ltr" maxLength={100} />
        </Field>
      </div>
      {initiatives.length > 0 && !fromOffer ? (
        <Field name="initiativeId" label="المبادرة (اختيارية)">
          <Select defaultValue={entry?.initiativeId ?? ''}>
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
        <Textarea rows={2} maxLength={1000} defaultValue={entry?.description ?? ''} />
      </Field>
    </>
  );
}

// /admin/finance — finance:read. التسجيل لأمين الصندوق (finance:record)، والاعتماد للرئيس (finance:approve)،
// ولا يعتمد أحد قيدًا سجّله (funding_four_eyes). D29: العروض المالية المقبولة تنتظر هنا تسجيل قيدها.
// ?edit=<id>: نموذج تعديل القيد في العمود الجانبي — لا مسار جديد خارج §11.2.
export default async function FinancePage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { user, allowed, backHref } = await guardPage('/admin/finance', 'finance:read');
  if (!allowed) return <Forbidden backHref={backHref} />;
  const ledger = await financeLedger(user);
  const { records, awaiting, initiatives, organizations, totals } = ledger;
  const { record, approve } = ledger.can;

  const isEditable = (r: Entry) => record && !r.approvedAt && r.recordedById === user.id;
  const { edit } = await searchParams;
  const editing = records.find((r) => r.id === edit && isEditable(r));

  const columns = [
    {
      key: 'what',
      header: 'الحركة',
      cell: (r: Entry) => (
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
            {r.counterparty ? ` · ${r.counterparty}` : ''}
            {r.category ? ` · ${r.category}` : ''}
            {r.description ? ` · ${r.description}` : ''}
          </span>
        </span>
      ),
    },
    { key: 'date', header: 'التاريخ', className: 'hidden sm:table-cell', cell: (r: Entry) => formatDate(r.occurredAt) },
    {
      key: 'by',
      header: 'المسجِّل · المعتمِد',
      className: 'hidden md:table-cell',
      cell: (r: Entry) => `${r.recordedBy.fullName} · ${r.approvedBy?.fullName ?? '—'}`,
    },
    {
      key: 'status',
      header: 'الحالة',
      cell: (r: Entry) => (
        <span className="flex flex-col items-start gap-1.5">
          {r.approvedAt ? (
            <StatusBadge kind="funding" status="approved" />
          ) : approve && r.recordedById !== user.id ? (
            <ActionButtons items={[{ action: approveFundingAction, fields: { fundingId: r.id }, label: 'اعتماد القيد', variant: 'default' }]} />
          ) : (
            <StatusBadge kind="funding" status="pending" />
          )}
          {isEditable(r) ? (
            <Link href={`/admin/finance?edit=${r.id}`} className="text-xs text-brand hover:underline">
              تعديل أو حذف
            </Link>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="السجل المالي" description="كل حركة مالية بمسجّلها ومعتمدها. المجاميع من القيود المعتمدة، ولكل عملة على حدة، والمعلّق يظهر تحتها منفصلًا." />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CURRENCIES.flatMap((c) => {
          const t = totals[c];
          const pending = (v: string) => (Number(v) > 0 ? formatMoney(v, c) : undefined);
          return [
            <TotalCard key={`${c}-in`} label={`إجمالي الوارد (${CURRENCY_LABELS[c]})`} value={formatMoney(t.incoming, c)} tone="text-success" pending={pending(t.pendingIncoming)} />,
            <TotalCard key={`${c}-out`} label={`إجمالي المصروفات (${CURRENCY_LABELS[c]})`} value={formatMoney(t.outgoing, c)} pending={pending(t.pendingOutgoing)} />,
            <TotalCard key={`${c}-left`} label={`المتبقي في الصندوق (${CURRENCY_LABELS[c]})`} value={formatMoney(t.remaining, c)} tone={Number(t.remaining) < 0 ? 'text-danger' : 'text-brand'} />,
          ];
        })}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        قيود بانتظار الاعتماد: <strong className="text-warning">{records.filter((r) => !r.approvedAt).length}</strong> · عروض مقبولة بلا قيد:{' '}
        <strong className="text-foreground">{awaiting.length}</strong>
      </p>

      <datalist id="expense-categories">
        {EXPENSE_CATEGORIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">جدول المقبوضات (الوارد)</h2>
            <DataTable
              rows={records.filter((r) => r.direction === 'INCOMING')}
              rowKey={(r) => r.id}
              empty={{ title: 'لا مقبوضات بعد', hint: 'يسجّل أمين الصندوق كل وارد، ويعتمده الرئيس.' }}
              columns={columns}
            />
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">جدول المصروفات (الخارج)</h2>
            <DataTable
              rows={records.filter((r) => r.direction === 'OUTGOING')}
              rowKey={(r) => r.id}
              empty={{ title: 'لا مصروفات بعد', hint: 'يسجّل أمين الصندوق كل مصروف، ويعتمده الرئيس.' }}
              columns={columns}
            />
          </section>
        </div>

        {record ? (
          <div className="flex flex-col gap-4">
            {editing ? (
              <Card>
                <CardHeader>
                  <CardTitle>تعديل قيد بانتظار الاعتماد</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <ActionForm key={editing.id} action={updateFundingAction}>
                    <input type="hidden" name="fundingId" value={editing.id} />
                    <EntryFields entry={editing} initiatives={initiatives} organizations={organizations} />
                    <div className="flex flex-wrap items-center gap-2">
                      <SubmitButton>حفظ التعديل</SubmitButton>
                      <Button asChild variant="outline">
                        <Link href="/admin/finance">إغلاق</Link>
                      </Button>
                    </div>
                  </ActionForm>
                  <ActionButtons items={[{ action: deleteFundingAction, fields: { fundingId: editing.id }, label: 'حذف القيد', variant: 'destructive' }]} />
                </CardContent>
              </Card>
            ) : null}
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
                  <EntryFields initiatives={initiatives} organizations={organizations} />
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
