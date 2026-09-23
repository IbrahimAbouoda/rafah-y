'use client';

import { startTermAction } from '@/server/actions/settings/terms';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { PermissionGate } from '@/components/shared/permission-gate';
import { Input } from '@/components/ui/form-controls';

export function StartTermForm({ hasCurrent }: { hasCurrent: boolean }) {
  return (
    <PermissionGate permission="users:manage_roles">
      <ActionForm action={startTermAction} resetOnSuccess>
        <Field name="name" label="اسم الدورة" hint="مثل: الدورة الثانية 2026–2028">
          <Input required />
        </Field>
        <Field name="startsAt" label="تاريخ البداية">
          <Input type="date" dir="ltr" required />
        </Field>
        <Field name="endsAt" label="تاريخ النهاية (اختياري)">
          <Input type="date" dir="ltr" />
        </Field>
        <SubmitButton
          variant={hasCurrent ? 'accent' : 'default'}
          onClick={(e) => {
            if (hasCurrent && !window.confirm('بدء دورة جديدة يوقف أدوار الدورة الحالية كلها. متابعة؟')) e.preventDefault();
          }}
        >
          بدء الدورة
        </SubmitButton>
      </ActionForm>
    </PermissionGate>
  );
}
