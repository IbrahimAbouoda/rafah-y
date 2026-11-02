'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

export type PublicNavGroup = { label: string; items: { href: string; label: string }[] };

/** قائمة منسدلة أصلية: تعمل بلا JavaScript، وتُغلق مع الاختيار أو النقر خارجها حين يتوفر */
function Menu({ group }: { group: PublicNavGroup }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open = false;
    };
    document.addEventListener('click', closeOutside);
    return () => document.removeEventListener('click', closeOutside);
  }, []);

  return (
    <details ref={ref} className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg px-2 py-1.5 whitespace-nowrap hover:bg-muted [&::-webkit-details-marker]:hidden">
        {group.label}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <ul className="absolute start-0 z-30 mt-1 flex min-w-44 flex-col rounded-lg border bg-surface p-1 shadow-md">
        {group.items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded-md px-3 py-2 hover:bg-muted"
              onClick={() => {
                if (ref.current) ref.current.open = false;
              }}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function PublicNav({ groups }: { groups: PublicNavGroup[] }) {
  return (
    <>
      {groups.map((group) => (
        <Menu key={group.label} group={group} />
      ))}
    </>
  );
}
