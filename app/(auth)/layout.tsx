import { ThemeToggle } from '@/components/shared/theme-toggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-1.5rem)] flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-2xl font-bold text-brand">نبض رفح</p>
        <p className="text-sm text-muted-foreground">صوت الشباب... فكرة تتحول إلى أثر</p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
      <ThemeToggle />
    </div>
  );
}
