'use client';

import { cloneElement, createContext, startTransition, use, useActionState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import type { ActionState } from '@/lib/action';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Label } from '@/components/ui/form-controls';
import { Alert } from '@/components/ui/surface';
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
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  hideSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <FormStateContext value={{ state, pending }}>
      <form
        ref={ref}
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
        {state?.message && !(state.ok && hideSuccess) ? (
          <Alert key={state.at} tone={state.ok ? 'success' : 'danger'}>
            {state.message}
          </Alert>
        ) : null}
      </form>
    </FormStateContext>
  );
}

/** حقل بعنوانه ورسالة خطئه. يضبط id و name و aria-invalid على العنصر الممرَّر. */
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
  children: React.ReactElement<Record<string, unknown>>;
  className?: string;
}) {
  const { state } = use(FormStateContext);
  const errors = state?.fieldErrors?.[name];
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={name}>{label}</Label>
      {cloneElement(children, {
        id: name,
        name,
        'aria-invalid': errors ? true : undefined,
        'aria-describedby': [errors ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined,
      })}
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
