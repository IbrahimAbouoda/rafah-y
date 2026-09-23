import { cn } from '@/lib/utils';

export function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full text-sm', className)} {...props} />
    </div>
  );
}

export const THead = (p: React.ComponentProps<'thead'>) => <thead className="bg-muted/60 text-muted-foreground" {...p} />;
export const TBody = (p: React.ComponentProps<'tbody'>) => <tbody className="divide-y" {...p} />;
export const TR = ({ className, ...p }: React.ComponentProps<'tr'>) => <tr className={cn('align-top', className)} {...p} />;
export const TH = ({ className, ...p }: React.ComponentProps<'th'>) => (
  <th className={cn('px-3 py-2 text-start font-medium whitespace-nowrap', className)} {...p} />
);
export const TD = ({ className, ...p }: React.ComponentProps<'td'>) => <td className={cn('px-3 py-2.5', className)} {...p} />;
