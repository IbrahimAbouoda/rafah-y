import Image from 'next/image';
import { COUNCIL_NAME_AR } from '@/lib/config';
import logo from '@/public/logo.png';

/** الشعار + «نبض رفح» + اسم المجلس — رأس الصفحات العامة ولوحات الدخول (D40) */
export function BrandMark() {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Image src={logo} alt="" width={40} height={40} priority className="size-10 shrink-0 rounded-xl bg-white p-0.5 shadow-xs ring-1 ring-border" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-lg font-bold tracking-tight text-brand">نبض رفح</span>
        <span className="hidden truncate text-[11px] text-muted-foreground sm:block">{COUNCIL_NAME_AR}</span>
      </span>
    </span>
  );
}
