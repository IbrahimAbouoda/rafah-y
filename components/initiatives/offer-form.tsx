'use client';

import { submitOfferAction } from '@/server/actions/offers';
import { SUPPORT_TYPE_LABELS } from '@/lib/initiatives/workflow';
import type { SupportType } from '@/lib/generated/prisma/enums';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/form-controls';

// AC-10 — الدعم المالي وغير المالي بنفس المكانة؛ الخادم يتحقق من المؤسسة والاحتياج مرة أخرى
export function OfferForm({
  initiativeId,
  need,
  organizations,
}: {
  initiativeId: string;
  need: { id: string; type: SupportType } | null;
  organizations: { id: string; name: string }[];
}) {
  const types = Object.entries(SUPPORT_TYPE_LABELS) as [SupportType, string][];
  return (
    <ActionForm action={submitOfferAction} resetOnSuccess className="gap-3">
      <input type="hidden" name="initiativeId" value={initiativeId} />
      {need ? <input type="hidden" name="needId" value={need.id} /> : null}
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
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">نوع الدعم</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {types.map(([value, label]) => (
            <div key={value} className="flex items-center gap-1.5">
              <Checkbox id={`types-${initiativeId}-${need?.id ?? 'x'}-${value}`} name="types" value={value} defaultChecked={need?.type === value} />
              <Label htmlFor={`types-${initiativeId}-${need?.id ?? 'x'}-${value}`} className="font-normal">
                {label}
              </Label>
            </div>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <Field name="amount" label="المبلغ (للتمويل فقط)">
          <Input inputMode="decimal" dir="ltr" />
        </Field>
        <Field name="currency" label="العملة">
          <Select defaultValue="ILS">
            <option value="ILS">شيكل</option>
            <option value="USD">دولار</option>
          </Select>
        </Field>
      </div>
      <Field name="note" label="ملاحظات (اختيارية)" hint="مثل: موعد التسليم، أو شروط الدعم.">
        <Textarea rows={2} maxLength={2000} />
      </Field>
      <SubmitButton>إرسال عرض الدعم</SubmitButton>
    </ActionForm>
  );
}
