'use client';

import { createContext, startTransition, use, useActionState, useEffect, useId, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import type { ActionState } from '@/lib/action';
import { Button, type ButtonProps } from '@/components/ui/button';
import { FieldControlContext, Label } from '@/components/ui/form-controls';
import { Alert } from '@/components/ui/surface';
import { useFlash } from './flash';
import { cn } from '@/lib/utils';

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

const FormStateContext = createContext<{ state: ActionState; pending: boolean }>({ state: null, pending: false });

/**
 * نموذج يستدعي Server Action حقيقية ويعرض نتيجتها بالعربية.
 * مع JavaScript: الإرسال عبر onSubmit فلا يُمسح ما كتبه المستخدم عند الخطأ.
 * بلا JavaScript: يعمل كنموذج عادي عبر action.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  hideSuccess = false,
  id,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  hideSuccess?: boolean;
  /** لإرسال النموذج من خارجه، مثل قرار ConsentDialog */
  id?: string;
}) {
  const flash = useFlash();
  // النجاح يُسجَّل في رسالة الهيكل من داخل الاستدعاء: قد يزول النموذج نفسه مع تحديث الصفحة
  const [state, formAction, pending] = useActionState<ActionState, FormData>(async (prev, data) => {
    const result = await action(prev, data);
    if (result?.ok && result.message && flash && !hideSuccess) flash(result.message);
    return result;
  }, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <FormStateContext value={{ state, pending }}>
      <form
        ref={ref}
        id={id}
        action={formAction}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => formAction(data));
        }}
        noValidate
        className={cn('flex flex-col gap-4', className)}
      >
        {children}
        {state?.message && !(state.ok && (hideSuccess || flash)) ? (
          <Alert key={state.at} tone={state.ok ? 'success' : 'danger'}>
            {state.message}
          </Alert>
        ) : null}
      </form>
    </FormStateContext>
  );
}

/** حقل بعنوانه ورسالة خطئه. يضبط id و name و aria-* على عنصر الإدخال بداخله (Input · Textarea · Select) عبر FieldControlContext. */
export function Field({
  name,
  label,
  hint,
  children,
  className,
}: {
  name: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { state } = use(FormStateContext);
  const errors = state?.fieldErrors?.[name];
  // معرّف فريد لكل حقل: الصفحة قد تحمل النموذج نفسه مرات (عرض لكل مؤسسة، قيد لكل عرض)،
  // ومعرّف مكرر يربط العنوان بحقل نموذج آخر (إمكانية الوصول)
  const id = `${name}-${useId()}`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      <FieldControlContext
        value={{
          id,
          name,
          'aria-invalid': errors ? true : undefined,
          'aria-describedby': [errors ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined,
        }}
      >
        {children}
      </FieldControlContext>
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {errors ? (
        <p id={errorId} className="text-xs text-danger">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({ children, className, ...props }: ButtonProps) {
  const { pending } = use(FormStateContext);
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} className={className} {...props}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </Button>
  );
}
