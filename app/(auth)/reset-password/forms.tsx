'use client';

import { requestResetAction, setNewPasswordAction } from '@/server/actions/auth';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { Input } from '@/components/ui/form-controls';

export function RequestResetForm() {
  return (
    <ActionForm action={requestResetAction} resetOnSuccess>
      <Field name="email" label="البريد الإلكتروني">
        <Input type="email" autoComplete="email" dir="ltr" required />
      </Field>
      <SubmitButton className="w-full">أرسل رابط الاستعادة</SubmitButton>
    </ActionForm>
  );
}

/** requireCurrent: خارج نافذة رابط الاستعادة تُطلب كلمة المرور الحالية (M-4) — الخادم يفرضها في كل حال */
export function NewPasswordForm({ requireCurrent }: { requireCurrent: boolean }) {
  return (
    <ActionForm action={setNewPasswordAction}>
      {requireCurrent ? (
        <Field name="currentPassword" label="كلمة المرور الحالية" hint="لم تعد في نافذة رابط الاستعادة، فنتحقق منك أولًا.">
          <Input type="password" autoComplete="current-password" dir="ltr" required />
        </Field>
      ) : null}
      <Field name="password" label="كلمة المرور الجديدة" hint="10 محارف على الأقل، تجمع حروفًا إنجليزية وأرقامًا.">
        <Input type="password" autoComplete="new-password" dir="ltr" required />
      </Field>
      <Field name="confirm" label="تأكيد كلمة المرور">
        <Input type="password" autoComplete="new-password" dir="ltr" required />
      </Field>
      <SubmitButton className="w-full">حفظ كلمة المرور</SubmitButton>
    </ActionForm>
  );
}
