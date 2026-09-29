import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import type { OpportunityType } from '@/lib/generated/prisma/enums';
import { OPPORTUNITY_TYPE_LABELS, openOpportunityWhere } from '@/lib/opportunities/workflow';
import { OPPORTUNITY_TYPES } from '@/lib/validation/opportunities';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/states';
import { Card } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'بوابة الفرص' };
export const dynamic = 'force-dynamic';

// /opportunities — عام: الفرص المنشورة التي لم ينتهِ موعدها. لا بريد جماعي عند النشر (§8.2).
export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type: raw } = await searchParams;
  const type = OPPORTUNITY_TYPES.includes(raw as OpportunityType) ? (raw as OpportunityType) : undefined;
  const now = new Date();
  const opportunities = await db.opportunity.findMany({
    where: { ...openOpportunityWhere(now), ...(type ? { type } : {}) },
    orderBy: [{ deadline: { sort: 'asc', nulls: 'last' } }, { publishedAt: 'desc' }],
    take: 100,
    select: {
      id: true,
      title: true,
      type: true,
      applyMode: true,
      deadline: true,
      isDemo: true,
      organization: { select: { name: true } },
      area: { select: { nameAr: true } },
      skills: { select: { skill: { select: { nameAr: true } } } },
    },
  });

  const chip = (href: string, label: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-full border px-3 py-1 text-sm ${active ? 'border-brand bg-brand text-brand-foreground' : 'hover:bg-muted'}`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader title="بوابة الفرص" description="وظائف وتدريبات ومنح ومساعدات في مكان واحد، تراجعها أمانة السر قبل نشرها." />
      <nav aria-label="تصفية حسب النوع" className="mb-4 flex flex-wrap gap-2">
        {chip('/opportunities', 'الكل', !type)}
        {OPPORTUNITY_TYPES.map((t) => chip(`/opportunities?type=${t}`, OPPORTUNITY_TYPE_LABELS[t], type === t))}
      </nav>
      {opportunities.length === 0 ? (
        <Card>
          <EmptyState
            title={type ? `لا فرص «${OPPORTUNITY_TYPE_LABELS[type]}» مفتوحة الآن` : 'لا فرص مفتوحة الآن'}
            hint="تُنشر الفرص حين تصل من المؤسسات الشريكة وتراجعها أمانة السر. أكمل ملفك ومهاراتك لتكون جاهزًا."
          >
            <Link href="/me/profile" className="text-sm text-brand hover:underline">
              أكمل ملفي
            </Link>
          </EmptyState>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {opportunities.map((o) => (
            <li key={o.id}>
              <Card className="flex h-full flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/opportunities/${o.id}`} className="font-semibold text-brand hover:underline">
                    {o.title}
                  </Link>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs">{OPPORTUNITY_TYPE_LABELS[o.type]}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {o.organization?.name ?? 'المجلس'}
                  {o.area ? ` · ${o.area.nameAr}` : ''}
                  {o.isDemo ? ' · بيانات عرض' : ''}
                </p>
                {o.skills.length ? (
                  <p className="text-xs">المهارات: {o.skills.map((s) => s.skill.nameAr).join('، ')}</p>
                ) : null}
                <p className="mt-auto text-xs text-muted-foreground">
                  {o.deadline ? `آخر موعد: ${formatDate(o.deadline)}` : 'بلا موعد نهائي'}
                  {o.applyMode === 'EXTERNAL' ? ' · التقديم عبر رابط الجهة' : ''}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
