import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // الأزرار المصمتة ترتفع قليلًا عند التحويم؛ الشفافة والروابط تبقى ثابتة
        default: 'bg-brand text-brand-foreground shadow-xs hover:bg-brand/90 hover:shadow-md motion-safe:hover:-translate-y-0.5',
        accent: 'bg-accent-solid text-accent-solid-foreground shadow-xs hover:bg-accent-solid/90 hover:shadow-md motion-safe:hover:-translate-y-0.5',
        destructive: 'bg-danger text-danger-foreground shadow-xs hover:bg-danger/90 hover:shadow-md motion-safe:hover:-translate-y-0.5',
        outline: 'border bg-surface shadow-xs hover:border-brand/30 hover:bg-muted motion-safe:hover:-translate-y-0.5',
        ghost: 'hover:bg-muted',
        link: 'text-brand underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 px-6',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export type ButtonProps = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
