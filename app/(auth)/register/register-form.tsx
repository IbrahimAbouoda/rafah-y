'use client';

import { useState } from 'react';
import { registerAction } from '@/server/actions/auth';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { Input } from '@/components/ui/form-controls';
import { cn } from '@/lib/utils';

export function RegisterForm() {
  const [channel, setChannel] = useState<'email' | 'phone'>('email');
  return (
    <ActionForm action={registerAction}>
      <Field name="fullName" label="الاسم الكامل">
        <Input autoComplete="name" required />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">طريقة الدخول</legend>
        <input type="hidden" name="channel" value={channel} />
        <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(['email', 'phone'] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={channel === c}
              onClick={() => setChannel(c)}
              className={cn('rounded-md py-1.5 text-sm', channel === c ? 'bg-surface font-medium shadow-sm' : 'text-muted-foreground')}
            >
              {c === 'email' ? 'البريد الإلكتروني' : 'رقم الجوّال'}
            </button>
          ))}
        </div>
      </fieldset>

      {channel === 'email' ? (
        <Field name="email" label="البريد الإلكتروني">
          <Input type="email" autoComplete="email" dir="ltr" required />
        </Field>
      ) : (
        <Field name="phone" label="رقم الجوّال" hint="مثل 0599123456">
          <Input type="tel" autoComplete="tel" inputMode="tel" dir="ltr" required />
        </Field>
      )}

      <Field name="password" label="كلمة المرور" hint="10 محارف على الأقل، تجمع حروفًا إنجليزية وأرقامًا.">
        <Input type="password" autoComplete="new-password" dir="ltr" required />
      </Field>
      <Field name="confirm" label="تأكيد كلمة المرور">
        <Input type="password" autoComplete="new-password" dir="ltr" required />
      </Field>
      <SubmitButton className="w-full">إنشاء الحساب</SubmitButton>
    </ActionForm>
  );
}
