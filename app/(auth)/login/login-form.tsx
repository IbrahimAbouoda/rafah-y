'use client';

import { loginAction } from '@/server/actions/auth';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { Input } from '@/components/ui/form-controls';

export function LoginForm({ next }: { next: string }) {
  return (
    <ActionForm action={loginAction}>
      <input type="hidden" name="next" value={next} />
      <Field name="identifier" label="البريد الإلكتروني أو رقم الجوّال">
        <Input autoComplete="username" inputMode="email" dir="ltr" required />
      </Field>
      <Field name="password" label="كلمة المرور">
        <Input type="password" autoComplete="current-password" dir="ltr" required />
      </Field>
      <SubmitButton className="w-full">دخول</SubmitButton>
    </ActionForm>
  );
}
