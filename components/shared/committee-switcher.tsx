'use client';

import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

// CommitteeSwitcher — PRD §12: لجان المستخدم في الدورة الحالية فقط، لا التسع.
// لجنة واحدة ⇒ اسم ثابت بلا قائمة · لا لجان ⇒ لا يظهر.
export function CommitteeSwitcher({
  committees,
  current,
  section,
}: {
  committees: { slug: string; nameAr: string }[];
  current?: string;
  /** الصفحة داخل اللجنة (مثل "tasks"). نص لا دالة: المكوّن عميل ويُستدعى من مكوّنات خادم */
  section?: 'tasks';
}) {
  const hrefFor = (slug: string) => `/admin/committees/${slug}${section ? `/${section}` : ''}`;
  const router = useRouter();
  if (committees.length === 0) return null;
  if (committees.length === 1) {
    return <span className="text-sm font-medium text-muted-foreground">{committees[0]!.nameAr}</span>;
  }
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">تبديل اللجنة</span>
      <select
        value={current ?? ''}
        onChange={(e) => e.target.value && router.push(hrefFor(e.target.value))}
        className="h-9 appearance-none rounded-lg border border-input bg-surface ps-3 pe-8 text-sm font-medium"
      >
        {current ? null : <option value="">— اختر لجنة —</option>}
        {committees.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.nameAr}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute end-2 size-4 text-muted-foreground" aria-hidden />
    </label>
  );
}
