import Image from 'next/image';
import { COUNCIL_NAME_AR } from '@/lib/config';
import logo from '@/public/logo.png';

/** الشعار + «نبض رفح» + اسم المجلس — رأس الصفحات العامة ولوحات الدخول (D40) */
export function BrandMark() {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Image src={logo} alt="" width={36} height={36} priority className="size-9 shrink-0 rounded-md bg-white" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-lg font-bold text-brand">نبض رفح</span>
        <span className="hidden truncate text-[11px] text-muted-foreground sm:block">{COUNCIL_NAME_AR}</span>
      </span>
    </span>
  );
}
