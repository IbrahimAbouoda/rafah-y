import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/surface';
import { EmptyIllustration } from './empty-illustration';

// الحالات الثلاث الإلزامية لكل شاشة: فارغ · تحميل · خطأ (PRD §12 · DoD 6–8)

/** حالة فارغة تقول ماذا يفعل المستخدم الآن، لا «لا توجد بيانات» فقط */
export function EmptyState({ title, hint, children }: { title: string; hint: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <EmptyIllustration className="mb-1" />
      <p className="font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>
      {children}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <Card className="p-4" aria-busy aria-label="جارٍ التحميل">
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex gap-3">
            {Array.from({ length: cols }, (_, c) => (
              <Skeleton key={c} className="h-5 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy aria-label="جارٍ التحميل">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <TableSkeleton />
    </div>
  );
}

/** يُعرض بدل الصفحة لمن لا يملك صلاحيتها — الفحص الفعلي تم على الخادم قبل أي قراءة. */
export function Forbidden({ backHref }: { backHref: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <Lock className="size-8 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-semibold">لا تملك صلاحية هذه الصفحة</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        إن كنت تحتاج الوصول إليها، اطلب من رئيس المجلس أو المدير التقني تعيين الدور المناسب لك.
      </p>
      <Button asChild variant="outline">
        <Link href={backHref}>العودة</Link>
      </Button>
    </Card>
  );
}
