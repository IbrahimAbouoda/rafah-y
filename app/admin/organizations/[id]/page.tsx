import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { formatMoney, SUPPORT_TYPE_LABELS } from '@/lib/initiatives/workflow';
import { INTERACTION_LABELS, ORG_TYPE_LABELS, STAGE_LABELS } from '@/lib/organization-labels';
import { organizationProfile } from '@/lib/organizations';
import { guardPage } from '@/lib/page-guard';
import { formatDate } from '@/lib/utils';
import { INTERACTION_TYPES, PARTNERSHIP_STAGES } from '@/lib/validation/initiatives';
import { linkMemberAction, logInteractionAction, setOrganizationStageAction, unlinkMemberAction } from '@/server/actions/organizations';
import { ActionButtons } from '@/components/shared/action-buttons';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/form-controls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'ملف مؤسسة' };

// /admin/organizations/[id] — organizations:read · organizations:log · الربط بالحساب لـ organizations:manage (D26)
export default async function OrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, allowed, backHref } = await guardPage(`/admin/organizations/${id}`, 'organizations:read', { beyondOwn: true });
  if (!allowed) return <Forbidden backHref={backHref} />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  // M-1 · M-2: ما يُجلب محكوم بالصلاحية داخل organizationProfile() — البريد والعروض خارج النطاق لا تُقرأ أصلًا
  const { org, manage, log, readOffers } = await organizationProfile(db, user, id);
  if (!org) notFound();

  return (
    <>
      <PageHeader title={org.name} description={`${ORG_TYPE_LABELS[org.type]}${org.country ? ` · ${org.country}` : ''}${org.sectors.length ? ` · ${org.sectors.join('، ')}` : ''}`}>
        <span className="rounded-full bg-muted px-2.5 py-1 text-sm">{STAGE_LABELS[org.stage]}</span>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>سجل التواصل</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {log ? (
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-brand">سجّل تواصلًا</summary>
                  <ActionForm action={logInteractionAction} resetOnSuccess className="mt-3">
                    <input type="hidden" name="organizationId" value={org.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field name="type" label="النوع">
                        <Select defaultValue="CALL">
                          {INTERACTION_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {INTERACTION_LABELS[t]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field name="occurredAt" label="التاريخ">
                        <Input type="date" />
                      </Field>
                    </div>
                    <Field name="summary" label="الملخص">
                      <Textarea rows={3} maxLength={2000} />
                    </Field>
                    <Field name="followUpAt" label="موعد متابعة (اختياري)">
                      <Input type="date" />
                    </Field>
                    <SubmitButton size="sm">تسجيل</SubmitButton>
                  </ActionForm>
                </details>
              ) : null}
              {org.interactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا تواصل مسجّل بعد.</p>
              ) : (
                <ul className="flex flex-col gap-3 text-sm">
                  {org.interactions.map((i) => (
                    <li key={i.id} className="border-s-2 ps-3">
                      <p className="text-xs text-muted-foreground">
                        {INTERACTION_LABELS[i.type]} · {formatDate(i.occurredAt)} · {i.loggedBy.fullName}
                        {i.followUpAt ? ` · متابعة ${formatDate(i.followUpAt)}` : ''}
                      </p>
                      <p className="whitespace-pre-line">{i.summary}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {readOffers ? (
            <Card>
              <CardHeader>
                <CardTitle>عروض الدعم</CardTitle>
              </CardHeader>
              <CardContent>
                {org.offers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لم تقدّم المؤسسة عروضًا بعد.</p>
                ) : (
                  <ul className="flex flex-col divide-y text-sm">
                    {org.offers.map((o) => (
                      <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span>
                          <Link href={`/admin/initiatives/${o.initiative.id}`} className="text-brand hover:underline">
                            {o.initiative.title}
                          </Link>{' '}
                          · {o.types.map((t) => SUPPORT_TYPE_LABELS[t]).join('، ')}
                          {o.amount ? ` · ${formatMoney(o.amount, o.currency)}` : ''}
                        </span>
                        <StatusBadge kind="offer" status={o.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          {manage ? (
            <Card>
              <CardHeader>
                <CardTitle>مرحلة الشراكة</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={setOrganizationStageAction} className="gap-2">
                  <input type="hidden" name="organizationId" value={org.id} />
                  <Field name="stage" label="المرحلة">
                    <Select defaultValue={org.stage}>
                      {PARTNERSHIP_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {STAGE_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <SubmitButton size="sm" variant="outline">
                    حفظ
                  </SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>ممثلو المؤسسة على المنصة</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {org.members.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا حساب مربوط. يسجّل ممثل المؤسسة حسابًا، ثم يُربط هنا.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {org.members.map((m) => (
                    <li key={m.user.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex flex-col">
                        <span>
                          {m.user.fullName}
                          {m.isAdmin ? <span className="ms-1 text-xs text-muted-foreground">(مسؤول)</span> : null}
                        </span>
                        {m.user.email ? (
                          <span className="text-xs text-muted-foreground" dir="ltr">
                            {m.user.email}
                          </span>
                        ) : null}
                      </span>
                      {manage ? (
                        <ActionButtons
                          items={[{ action: unlinkMemberAction, fields: { organizationId: org.id, userId: m.user.id }, label: 'فكّ الربط', variant: 'ghost' }]}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {manage ? (
                <ActionForm action={linkMemberAction} resetOnSuccess className="gap-2 border-t pt-3">
                  <input type="hidden" name="organizationId" value={org.id} />
                  <Field name="email" label="ربط حساب ببريده" hint="يُمنح دور «مؤسسة شريكة» ويدخل بوابة المؤسسات.">
                    <Input type="email" dir="ltr" />
                  </Field>
                  <div className="flex items-center gap-2">
                    <Checkbox id="isAdmin" name="isAdmin" />
                    <Label htmlFor="isAdmin">مسؤول حساب المؤسسة</Label>
                  </div>
                  <SubmitButton size="sm">ربط</SubmitButton>
                </ActionForm>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-2 pt-4 text-sm sm:pt-5">
              <p>
                <span className="text-muted-foreground">مسؤول العلاقة: </span>
                {org.owner?.fullName ?? '—'}
              </p>
              <p>
                <span className="text-muted-foreground">آخر تواصل: </span>
                {formatDate(org.lastContactAt)}
              </p>
              {org.website ? (
                <a href={org.website} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline" dir="ltr">
                  {org.website}
                </a>
              ) : null}
              {org.initiativePartners.length > 0 ? (
                <div>
                  <p className="text-muted-foreground">شريكة في</p>
                  <ul className="list-disc ps-4">
                    {org.initiativePartners.map((p) => (
                      <li key={p.initiative.id}>
                        <Link href={`/admin/initiatives/${p.initiative.id}`} className="text-brand hover:underline">
                          {p.initiative.title}
                        </Link>{' '}
                        <span className="text-xs text-muted-foreground">({p.role})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
