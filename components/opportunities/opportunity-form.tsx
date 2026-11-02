'use client';

import { useState } from 'react';
import { createOpportunityAction } from '@/server/actions/opportunities';
import { OPPORTUNITY_TYPE_LABELS } from '@/lib/opportunities/workflow';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/form-controls';

type Option = { id: string; name: string };

// /partner/opportunities/new — الفرصة تدخل المراجعة (PENDING_REVIEW)؛ الخادم يتحقق من المؤسسة مرة أخرى
export function OpportunityForm({
  organizations,
  areas,
  skills,
}: {
  organizations: Option[];
  areas: Option[];
  skills: Option[];
}) {
  const [mode, setMode] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL');
  return (
    <ActionForm action={createOpportunityAction} resetOnSuccess className="gap-3">
      {organizations.length > 1 ? (
        <Field name="organizationId" label="باسم المؤسسة">
          <Select defaultValue={organizations[0]!.id}>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="organizationId" value={organizations[0]?.id ?? ''} />
      )}
      <Field name="title" label="عنوان الفرصة">
        <Input maxLength={200} required />
      </Field>
      <Field name="description" label="الوصف والشروط" hint="من تستهدف الفرصة، وما المطلوب، وما الذي يحصل عليه المقبول.">
        <Textarea rows={5} maxLength={5000} required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="type" label="النوع">
          <Select defaultValue="">
            <option value="" disabled>
              اختر النوع
            </option>
            {Object.entries(OPPORTUNITY_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field name="applyMode" label="طريقة التقديم">
          <Select value={mode} onChange={(e) => setMode(e.target.value as 'INTERNAL' | 'EXTERNAL')}>
            <option value="INTERNAL">داخل المنصة — نرى المتقدّمين الموافقين</option>
            <option value="EXTERNAL">عبر رابطنا الرسمي — لا طلبات هنا</option>
          </Select>
        </Field>
      </div>
      {mode === 'EXTERNAL' ? (
        <Field name="externalUrl" label="رابط التقديم الرسمي">
          <Input type="url" dir="ltr" placeholder="https://" maxLength={500} />
        </Field>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field name="deadline" label="آخر موعد للتقديم (اختياري)">
          <Input type="date" dir="ltr" />
        </Field>
        <Field name="seats" label="عدد المقاعد (اختياري)">
          <Input inputMode="numeric" dir="ltr" />
        </Field>
        <Field name="areaId" label="المنطقة (اختيارية)">
          <Select defaultValue="">
            <option value="">كل المناطق</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {skills.length > 0 ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium">المهارات المطلوبة (اختيارية)</legend>
          <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            {skills.map((s) => (
              <div key={s.id} className="flex items-center gap-1.5">
                <Checkbox id={`opp-skill-${s.id}`} name="skillIds" value={s.id} />
                <Label htmlFor={`opp-skill-${s.id}`} className="font-normal">
                  {s.name}
                </Label>
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}
      <SubmitButton className="self-start">إرسال للمراجعة</SubmitButton>
    </ActionForm>
  );
}
