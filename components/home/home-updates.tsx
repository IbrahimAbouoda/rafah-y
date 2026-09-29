import Link from 'next/link';
import { Briefcase, CalendarDays, ChartColumn, type LucideIcon } from 'lucide-react';
import { latestUpdates, type UpdateKind } from '@/lib/home/updates';
import { formatDate } from '@/lib/utils';
import { EmptyState } from '@/components/shared/states';
import { Alert, Card, Skeleton } from '@/components/ui/surface';

const KINDS: Record<UpdateKind, { label: string; date: string; icon: LucideIcon; tint: string }> = {
  activity: { label: 'نشاط قادم', date: 'يبدأ', icon: CalendarDays, tint: 'bg-accent/10 text-accent' },
  opportunity: { label: 'فرصة مفتوحة', date: 'نُشرت', icon: Briefcase, tint: 'bg-brand/10 text-brand' },
  report: { label: 'تقرير منشور', date: 'نُشر', icon: ChartColumn, tint: 'bg-brand/10 text-brand' },
};

/** «آخر المستجدات» — سجلات عامة حقيقية فقط (lib/home/updates.ts). فارغ · خطأ هنا، والتحميل في HomeUpdatesSkeleton */
export async function HomeUpdates() {
  const updates = await latestUpdates().catch(() => null);
  if (!updates) {
    return <Alert tone="warning">تعذّر تحميل المستجدات الآن. حدّث الصفحة بعد قليل.</Alert>;
  }
  if (updates.length === 0) {
    return (
      <Card>
        <EmptyState
          title="لا مستجدات منشورة بعد"
          hint="تظهر هنا الأنشطة القادمة والفرص المفتوحة والتقارير المنشورة حين يضيفها المجلس."
        />
      </Card>
    );
  }
  return (
    <Card>
      <ul className="divide-y">
        {updates.map((u) => {
          const k = KINDS[u.kind];
          const Icon = k.icon;
          return (
            <li key={`${u.kind}-${u.id}`}>
              <Link href={u.href} className="flex items-start gap-3 p-4 transition-colors hover:bg-muted/60">
                <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${k.tint}`}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <bdi className="font-medium leading-6">{u.title}</bdi>
                  <span className="text-xs text-muted-foreground">
                    {k.label}
                    {u.date ? ` · ${k.date} ${formatDate(u.date)}` : ''}
                    {u.isDemo ? ' · بيانات عرض' : ''}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function HomeUpdatesSkeleton() {
  return (
    <Card className="flex flex-col divide-y" aria-busy aria-label="جارٍ تحميل المستجدات">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-start gap-3 p-4">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </Card>
  );
}
