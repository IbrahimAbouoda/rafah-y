'use client';

import { saveActivityAction } from '@/server/actions/activities';
import type { ActivityKind } from '@/lib/generated/prisma/enums';
import { ACTIVITY_KIND_LABELS } from '@/lib/activities/workflow';
import { toDateTimeInput } from '@/lib/utils';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/form-controls';

type Option = { id: string; name: string };

export type ActivityDraft = {
  id: string;
  committeeId: string | null;
  title: string;
  description: string | null;
  kind: ActivityKind;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  areaId: string | null;
  seats: number | null;
  registrationOpen: boolean;
  outcomes: string | null;
  partnerIds: string[];
};

// إنشاء نشاط (activities:create) أو تعديله (activities:update). اللجان المعروضة = ما يملك المستخدم الصلاحية فيها؛
// الخادم يفحص اللجنة مرة أخرى (D34: كل نشاط تتبعه لجنة).
export function ActivityForm({
  activity,
  committees,
  areas,
  organizations,
}: {
  activity?: ActivityDraft;
  committees: Option[];
  areas: Option[];
  organizations: Option[];
}) {
  const key = activity?.id ?? 'new';
  return (
    <ActionForm action={saveActivityAction} resetOnSuccess={!activity} className="gap-3">
      {activity ? <input type="hidden" name="id" value={activity.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <Field name="title" label="العنوان">
          <Input maxLength={200} defaultValue={activity?.title} required />
        </Field>
        <Field name="kind" label="النوع">
          <Select defaultValue={activity?.kind ?? 'ACTIVITY'}>
            {Object.entries(ACTIVITY_KIND_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field name="committeeId" label="اللجنة المنظِّمة" hint="أعضاؤها يسجّلون الحضور.">
        <Select defaultValue={activity?.committeeId ?? (committees.length === 1 ? committees[0]!.id : '')}>
          {committees.length > 1 ? (
            <option value="" disabled>
              اختر اللجنة
            </option>
          ) : null}
          {committees.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field name="description" label="الوصف (اختياري)">
        <Textarea rows={3} maxLength={5000} defaultValue={activity?.description ?? ''} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="startsAt" label="يبدأ">
          <Input type="datetime-local" dir="ltr" defaultValue={toDateTimeInput(activity?.startsAt)} required />
        </Field>
        <Field name="endsAt" label="ينتهي (اختياري)">
          <Input type="datetime-local" dir="ltr" defaultValue={toDateTimeInput(activity?.endsAt)} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field name="location" label="المكان (اختياري)">
          <Input maxLength={200} defaultValue={activity?.location ?? ''} />
        </Field>
        <Field name="areaId" label="المنطقة (اختيارية)">
          <Select defaultValue={activity?.areaId ?? ''}>
            <option value="">—</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field name="seats" label="المقاعد" hint="فارغ = بلا حد. بعد امتلائها يدخل المسجّل قائمة الانتظار.">
          <Input inputMode="numeric" dir="ltr" defaultValue={activity?.seats ?? ''} />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id={`reg-open-${key}`} name="registrationOpen" defaultChecked={activity?.registrationOpen ?? true} />
        <Label htmlFor={`reg-open-${key}`} className="font-normal">
          التسجيل مفتوح
        </Label>
      </div>
      {organizations.length > 0 ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium">المؤسسات الشريكة (اختيارية)</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {organizations.map((o) => (
              <div key={o.id} className="flex items-center gap-1.5">
                <Checkbox
                  id={`partner-${key}-${o.id}`}
                  name="partnerIds"
                  value={o.id}
                  defaultChecked={activity?.partnerIds.includes(o.id)}
                />
                <Label htmlFor={`partner-${key}-${o.id}`} className="font-normal">
                  {o.name}
                </Label>
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}
      {activity ? (
        <Field name="outcomes" label="المخرجات والتوثيق" hint="ما الذي تحقق؟ يظهر للعامة بعد انتهاء النشاط.">
          <Textarea rows={3} maxLength={5000} defaultValue={activity.outcomes ?? ''} />
        </Field>
      ) : null}
      <SubmitButton className="self-start">{activity ? 'حفظ التعديلات' : 'إنشاء النشاط'}</SubmitButton>
    </ActionForm>
  );
}
