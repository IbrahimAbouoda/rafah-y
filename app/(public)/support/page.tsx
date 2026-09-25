import type { Metadata } from 'next';
import Link from 'next/link';
import { COUNCIL_EMAIL } from '@/lib/config';
import { db } from '@/lib/db';
import { formatMoney, OFFERABLE_INITIATIVE_STATUSES, OPEN_NEED_STATUSES, SUPPORT_TYPE_LABELS } from '@/lib/initiatives/workflow';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'ادعمنا' };
export const dynamic = 'force-dynamic';

// /support — «ادعمنا» مدخل المؤسسات (§11.2). الاحتياجات المفتوحة للمبادرات المعتمدة فقط؛ المغطّى لا يظهر (AC-09 ③).
export default async function SupportPage() {
  const needs = await db.initiativeNeed.findMany({
    where: { status: { in: OPEN_NEED_STATUSES }, initiative: { status: { in: OFFERABLE_INITIATIVE_STATUSES } } },
    orderBy: [{ initiative: { isFlagship: 'desc' } }, { createdAt: 'asc' }],
    take: 100,
    select: {
      id: true,
      type: true,
      description: true,
      quantity: true,
      unit: true,
      amount: true,
      status: true,
      initiative: { select: { slug: true, title: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="ادعمنا"
        description="احتياجات مرقّمة لمبادرات الشباب في رفح: ما المطلوب بالضبط، وكم، ولأي مبادرة. الدعم غير المالي بمكانة المالي تمامًا."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {needs.length === 0 ? (
          <Card>
            <EmptyState title="لا احتياجات مفتوحة الآن" hint="كل الاحتياجات المنشورة مغطّاة. تابع صفحة المبادرات لما يُعتمد لاحقًا." />
          </Card>
        ) : (
          <Card>
            <ul className="flex flex-col divide-y text-sm">
              {needs.map((n) => (
                <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span className="flex flex-col">
                    <span className="font-medium">
                      {SUPPORT_TYPE_LABELS[n.type]}: {n.description}
                    </span>
                    <Link href={`/initiatives/${n.initiative.slug}`} className="text-xs text-brand hover:underline">
                      {n.initiative.title}
                    </Link>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {n.quantity ? `${n.quantity} ${n.unit ?? ''}` : ''}
                    {n.amount ? formatMoney(n.amount, 'ILS') : ''}
                    <StatusBadge kind="need" status={n.status} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>مؤسستكم تستطيع المساعدة؟</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>1. أنشئ حسابًا لممثل المؤسسة.</p>
            <p>
              2. راسل المجلس على <span dir="ltr" className="font-mono">{COUNCIL_EMAIL}</span> باسم المؤسسة وبريد الحساب، فيربطه المجلس بمؤسستكم.
            </p>
            <p>3. قدّموا عروض الدعم من بوابة المؤسسات، وتابعوا قرار المجلس عليها.</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/register">إنشاء حساب</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/login?next=/partner">دخول المؤسسات</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
