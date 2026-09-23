'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  Calendar,
  FileText,
  History,
  House,
  Inbox,
  Layers,
  MapPin,
  Plus,
  Shield,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { NavGroup, NavIcon } from '@/lib/nav';
import { cn } from '@/lib/utils';

const ICONS: Record<NavIcon, LucideIcon> = {
  users: Users,
  shield: Shield,
  calendar: Calendar,
  layers: Layers,
  tags: Tags,
  map: MapPin,
  home: House,
  inbox: Inbox,
  file: FileText,
  plus: Plus,
  bell: Bell,
  history: History,
};

/** عناصر مبنية من الصلاحيات على الخادم. على الجوّال: شريط تبويبات أفقي قابل للتمرير (PRD §12). */
export function Sidebar({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  if (groups.length === 0) return null;
  // أطول رابط مطابق هو النشط وحده: /me/complaints/new لا يُبرز «لوحتي» ولا «شكاواي» معه
  const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
  const active = hrefs
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === active;

  return (
    <>
      <nav aria-label="التنقل" className="border-b bg-surface lg:hidden">
        <ul className="flex gap-1 overflow-x-auto px-3 py-2">
          {groups.flatMap((g) =>
            g.items.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm whitespace-nowrap',
                      isActive(item.href) ? 'bg-brand text-brand-foreground' : 'bg-muted text-foreground',
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            }),
          )}
        </ul>
      </nav>

      <nav aria-label="التنقل" className="hidden w-60 shrink-0 border-e bg-surface lg:block">
        <div className="sticky top-16 flex flex-col gap-5 p-4">
          {groups.map((g) => (
            <div key={g.label} className="flex flex-col gap-1">
              <p className="px-2 text-xs font-medium text-muted-foreground">{g.label}</p>
              {g.items.map((item) => {
                const Icon = ICONS[item.icon];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive(item.href) ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-2 py-2 text-sm',
                      isActive(item.href) ? 'bg-brand-soft font-medium text-brand' : 'hover:bg-muted',
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
