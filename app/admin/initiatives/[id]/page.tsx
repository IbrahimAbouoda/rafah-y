import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import {
  formatMoney,
  INITIATIVE_STATUS_LABELS,
  INITIATIVE_TRANSITIONS,
  securedTotals,
  SUPPORT_TYPE_LABELS,
} from '@/lib/initiatives/workflow';
import { guardPage } from '@/lib/page-guard';
import { can } from '@/lib/rbac';
import { formatDate, toDateInput } from '@/lib/utils';
import { decideOfferAction } from '@/server/actions/offers';
import {
  postUpdateAction,
  removeNeedAction,
  saveInitiativeAction,
  setInitiativeStatusAction,
  updateProgressAction,
  upsertNeedAction,
} from '@/server/actions/initiatives';
import { ActionButtons } from '@/components/shared/action-buttons';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/form-controls';
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'مبادرة' };

const SUPPORT_TYPES = Object.entries(SUPPORT_TYPE_LABELS);

// /admin/initiatives/[id] — initiatives:update · initiatives:manage_needs (AC-09 · AC-10)
export default async function AdminInitiativePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, allowed, backHref } = await guardPage(`/admin/initiatives/${id}`, 'initiatives:update');
  if (!allowed) return <Forbidden backHref={backHref} />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const initiative = await db.initiative.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      description: true,
      status: true,
      committeeId: true,
      estimatedBudget: true,
      beneficiariesTarget: true,
      beneficiariesReached: true,
      impactSummary: true,
      progressPct: true,
      startsAt: true,
      endsAt: true,
      approvedAt: true,
      approvedBy: { select: { fullName: true } },
      committee: { select: { nameAr: true } },
      needs: { orderBy: { sortOrder: 'asc' }, select: { id: true, type: true, description: true, quantity: true, unit: true, amount: true, status: true, sortOrder: true } },
      offers: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          types: true,
          amount: true,
          currency: true,
          note: true,
          status: true,
          decisionNote: true,
          createdAt: true,
          organization: { select: { name: true } },
          need: { select: { description: true } },
          _count: { select: { fundingRecords: true } },
        },
      },
      partners: { select: { role: true, since: true, organization: { select: { id: true, name: true } } } },
      updates: { orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, body: true, isPublic: true, createdAt: true, author: { select: { fullName: true } } } },
      fundingRecords: { select: { direction: true, amount: true, currency: true, approvedAt: true } },
    },
  });
  // مبادرة لجنة غيره = غير موجودة
  if (!initiative || !can(user, 'initiatives:update', { committeeId: initiative.committeeId })) notFound();

  const ctx = { committeeId: initiative.committeeId };
  const manageNeeds = can(user, 'initiatives:manage_needs', ctx);
  const decide = can(user, 'offers:decide', ctx);
  const post = can(user, 'initiatives:post_update', ctx);
  const closed = initiative.status === 'COMPLETED' || initiative.status === 'CANCELLED';
  const statusButtons = INITIATIVE_TRANSITIONS[initiative.status]
    .filter((t) => can(user, t.permission, ctx))
    .map((t) => ({
      action: setInitiativeStatusAction,
      fields: { initiativeId: initiative.id, toStatus: t.to },
      label:
        t.to === 'PUBLISHED'
          ? 'اعتماد ونشر'
          : t.to === 'PENDING_APPROVAL'
            ? 'إرسال لاعتماد الرئيس'
            : t.to === 'DRAFT'
              ? 'إعادة للتعديل'
              : `نقل إلى «${INITIATIVE_STATUS_LABELS[t.to]}»`,
      variant: t.to === 'CANCELLED' ? ('destructive' as const) : t.to === 'PUBLISHED' ? ('default' as const) : ('outline' as const),
    }));
  const secured = Object.entries(securedTotals(initiative.fundingRecords));

  return (
    <>
      <PageHeader title={initiative.title} description={`${initiative.committee?.nameAr ?? ''}${initiative.approvedAt ? ` · اعتمدها ${initiative.approvedBy?.fullName} ${formatDate(initiative.approvedAt)}` : ''}`}>
        <div className="flex items-center gap-2">
          <StatusBadge kind="initiative" status={initiative.status} size="md" />
          {initiative.approvedAt ? (
            <Link href={`/initiatives/${initiative.slug}`} className="text-sm text-brand hover:underline">
              الصفحة العامة
            </Link>
          ) : null}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>الاحتياجات المرقّمة</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {initiative.needs.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا احتياجات بعد. لا تُرسل المبادرة للاعتماد قبل احتياج واحد على الأقل.</p>
              ) : (
                <ul className="flex flex-col divide-y rounded-lg border text-sm">
                  {initiative.needs.map((n, i) => (
                    <li key={n.id} className="flex flex-col gap-2 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {i + 1}. {SUPPORT_TYPE_LABELS[n.type]}: {n.description}
                          {n.quantity ? ` — ${n.quantity} ${n.unit ?? ''}` : ''}
                          {n.amount ? ` — ${formatMoney(n.amount, 'ILS')}` : ''}
                        </span>
                        <StatusBadge kind="need" status={n.status} />
                      </div>
                      {manageNeeds && !closed && n.status !== 'CANCELLED' && n.status !== 'COVERED' ? (
                        <ActionButtons items={[{ action: removeNeedAction, fields: { needId: n.id }, label: 'إلغاء الاحتياج', variant: 'ghost' }]} />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {manageNeeds && !closed ? (
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-brand">أضف احتياجًا</summary>
                  <ActionForm action={upsertNeedAction} resetOnSuccess className="mt-3">
                    <input type="hidden" name="initiativeId" value={initiative.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field name="type" label="النوع">
                        <Select defaultValue="">
                          <option value="">— اختر —</option>
                          {SUPPORT_TYPES.map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field name="amount" label="المبلغ بالشيكل (للتمويل)">
                        <Input inputMode="decimal" dir="ltr" />
                      </Field>
                    </div>
                    <Field name="description" label="الوصف" hint="بلغة يفهمها المموّل: ماذا بالضبط، ولماذا.">
                      <Input maxLength={1000} />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field name="quantity" label="الكمية (اختيارية)">
                        <Input type="number" min={1} />
                      </Field>
                      <Field name="unit" label="الوحدة (اختيارية)">
                        <Input maxLength={50} placeholder="جهاز، يوم، مشارك…" />
                      </Field>
                      <Field name="sortOrder" label="الترتيب">
                        <Input type="number" min={0} defaultValue={initiative.needs.length + 1} />
                      </Field>
                    </div>
                    <SubmitButton>إضافة</SubmitButton>
                  </ActionForm>
                </details>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>عروض الدعم</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {initiative.offers.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا عروض بعد. تصل المؤسسات إلى الاحتياجات بعد نشر المبادرة.</p>
              ) : (
                initiative.offers.map((o) => (
                  <div key={o.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{o.organization.name}</span>
                      <StatusBadge kind="offer" status={o.status} />
                    </div>
                    <p>
                      {o.types.map((t) => SUPPORT_TYPE_LABELS[t]).join('، ')}
                      {o.amount ? ` · ${formatMoney(o.amount, o.currency)}` : ''}
                      {o.need ? ` · للاحتياج: ${o.need.description}` : ' · دعم عام'}
                    </p>
                    {o.note ? <p className="text-muted-foreground">{o.note}</p> : null}
                    {o.decisionNote ? <p className="text-xs text-muted-foreground">القرار: {o.decisionNote}</p> : null}
                    {o.status === 'ACCEPTED' && o.types.includes('FUNDING') && o.amount ? (
                      <p className="text-xs">{o._count.fundingRecords ? 'سُجّل قيده في السجل المالي.' : 'بانتظار تسجيل أمين الصندوق للقيد عند وصول المبلغ.'}</p>
                    ) : null}
                    {decide && o.status === 'SUBMITTED' ? (
                      <ActionForm action={decideOfferAction} className="gap-2">
                        <input type="hidden" name="offerId" value={o.id} />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Field name="decision" label="القرار">
                            <Select defaultValue="ACCEPTED">
                              <option value="ACCEPTED">قبول وإضافة شريكًا</option>
                              <option value="REJECTED">اعتذار</option>
                            </Select>
                          </Field>
                          <Field name="partnerRole" label="دور الشريك (عند القبول)">
                            <Input placeholder="شريك داعم" maxLength={100} />
                          </Field>
                        </div>
                        <Field name="note" label="ملاحظة للمؤسسة" hint="إلزامية عند الاعتذار.">
                          <Textarea rows={2} maxLength={2000} />
                        </Field>
                        <SubmitButton size="sm">حفظ القرار</SubmitButton>
                      </ActionForm>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>تحديثات ميدانية</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {post && !closed ? (
                <ActionForm action={postUpdateAction} resetOnSuccess>
                  <input type="hidden" name="initiativeId" value={initiative.id} />
                  <Field name="body" label="التحديث">
                    <Textarea rows={3} maxLength={3000} />
                  </Field>
                  <div className="flex items-center gap-2">
                    <Checkbox id="isPublic" name="isPublic" />
                    <Label htmlFor="isPublic">عام — يظهر على صفحة المبادرة</Label>
                  </div>
                  <SubmitButton size="sm">نشر التحديث</SubmitButton>
                </ActionForm>
              ) : null}
              {initiative.updates.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا تحديثات بعد.</p>
              ) : (
                <ul className="flex flex-col gap-3 text-sm">
                  {initiative.updates.map((u) => (
                    <li key={u.id} className="border-s-2 ps-3">
                      <p className="text-xs text-muted-foreground">
                        {u.author.fullName} · {formatDate(u.createdAt)} · {u.isPublic ? 'عام' : 'داخلي'}
                      </p>
                      <p className="whitespace-pre-line">{u.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>المسار</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionButtons items={statusButtons} empty="لا انتقال متاح لك من هذه الحالة." />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>المبلغ المؤمَّن</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <p className="text-lg font-semibold text-success">{secured.length ? secured.map(([c, v]) => formatMoney(v, c)).join(' + ') : 'لا قيود معتمدة بعد'}</p>
              <p className="text-xs text-muted-foreground">من القيود الواردة المعتمدة في السجل المالي فقط — لا يُكتب يدويًا.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>الشركاء</CardTitle>
            </CardHeader>
            <CardContent>
              {initiative.partners.length === 0 ? (
                <p className="text-sm text-muted-foreground">يُضاف الشريك تلقائيًا حين يُقبل عرضه.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {initiative.partners.map((p) => (
                    <li key={p.organization.id}>
                      <Link href={`/admin/organizations/${p.organization.id}`} className="text-brand hover:underline">
                        {p.organization.name}
                      </Link>{' '}
                      <span className="text-xs text-muted-foreground">({p.role} منذ {formatDate(p.since)})</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {!closed ? (
            <Card>
              <CardHeader>
                <CardTitle>الإنجاز والأثر</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={updateProgressAction}>
                  <input type="hidden" name="initiativeId" value={initiative.id} />
                  <Field name="progressPct" label="نسبة الإنجاز ٪">
                    <Input type="number" min={0} max={100} defaultValue={initiative.progressPct} />
                  </Field>
                  <Field name="beneficiariesReached" label="المستفيدون فعليًا">
                    <Input type="number" min={0} defaultValue={initiative.beneficiariesReached ?? ''} />
                  </Field>
                  <Field name="impactSummary" label="ملخص الأثر">
                    <Textarea rows={2} maxLength={2000} defaultValue={initiative.impactSummary ?? ''} />
                  </Field>
                  <SubmitButton size="sm" variant="outline">
                    حفظ
                  </SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          ) : null}

          {!closed ? (
            <Card>
              <CardHeader>
                <CardTitle>البيانات</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={saveInitiativeAction}>
                  <input type="hidden" name="id" value={initiative.id} />
                  <input type="hidden" name="committeeId" value={initiative.committeeId ?? ''} />
                  <Field name="title" label="العنوان">
                    <Input defaultValue={initiative.title} maxLength={200} />
                  </Field>
                  <Field name="summary" label="الملخص">
                    <Textarea rows={2} maxLength={500} defaultValue={initiative.summary ?? ''} />
                  </Field>
                  <Field name="description" label="الوصف">
                    <Textarea rows={4} maxLength={5000} defaultValue={initiative.description ?? ''} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field name="estimatedBudget" label="الميزانية التقديرية ₪">
                      <Input inputMode="decimal" dir="ltr" defaultValue={initiative.estimatedBudget?.toString() ?? ''} />
                    </Field>
                    <Field name="beneficiariesTarget" label="المستفيدون المستهدفون">
                      <Input type="number" min={0} defaultValue={initiative.beneficiariesTarget ?? ''} />
                    </Field>
                    <Field name="startsAt" label="البداية">
                      <Input type="date" defaultValue={toDateInput(initiative.startsAt)} />
                    </Field>
                    <Field name="endsAt" label="النهاية">
                      <Input type="date" defaultValue={toDateInput(initiative.endsAt)} />
                    </Field>
                  </div>
                  <SubmitButton size="sm" variant="outline">
                    حفظ البيانات
                  </SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          ) : (
            <Alert tone="info">المبادرة {INITIATIVE_STATUS_LABELS[initiative.status]} ولا تُعدَّل.</Alert>
          )}
        </div>
      </div>
    </>
  );
}
