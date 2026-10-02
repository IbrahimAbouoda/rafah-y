'use client';

import { createContext, use } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

/**
 * ما يضبطه Field على عنصر الإدخال الذي بداخله (id · name · aria-*) — عبر السياق لا cloneElement:
 * عنصر يمرّره مكوّن خادم قد يصل في بث RSC للإنتاج مرجعًا كسولًا ($L…) لا عنصرًا، و cloneElement عليه
 * يُنتج نوعًا undefined (React #130). السياق يصل إلى العنصر أيًّا كانت طريقة بثّه. قيم Field تغلب كما كانت مع cloneElement.
 */
export type FieldControlProps = { id: string; name: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string };
export const FieldControlContext = createContext<FieldControlProps | null>(null);

function useFieldProps<P extends object>(props: P): P {
  const field = use(FieldControlContext);
  return field ? { ...props, ...field } : props;
}

const control =
  'w-full rounded-lg border border-input bg-surface px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 aria-[invalid=true]:border-danger';

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn(control, 'h-10', className)} {...useFieldProps(props)} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(control, 'min-h-24 py-2', className)} {...useFieldProps(props)} />;
}

/** قائمة أصلية: أوضح على الجوّال وتعمل بلا JavaScript */
export function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return <select className={cn(control, 'h-10', className)} {...useFieldProps(props)} />;
}

export function Checkbox({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  return <input type="checkbox" className={cn('size-4 accent-brand', className)} {...useFieldProps(props)} />;
}

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn('text-sm font-medium', className)} {...props} />;
}
