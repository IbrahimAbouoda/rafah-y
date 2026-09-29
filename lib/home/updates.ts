import 'server-only';
import { db } from '@/lib/db';
import { upcomingActivityWhere } from '@/lib/activities/workflow';
import { openOpportunityWhere } from '@/lib/opportunities/workflow';

// «آخر المستجدات» في الرئيسية: سجلات عامة فعلًا بشروط صفحاتها نفسها — لا محتوى مؤلَّف ولا جدول أخبار.
// التاريخ بمعناه لكل نوع: النشاط «يبدأ»، والفرصة والتقرير «نُشر».

export type UpdateKind = 'activity' | 'opportunity' | 'report';

export type HomeUpdate = {
  kind: UpdateKind;
  id: string;
  title: string;
  href: string;
  date: Date | null;
  isDemo: boolean;
};

const PER_KIND = 2;

export async function latestUpdates(now = new Date()): Promise<HomeUpdate[]> {
  const [activities, opportunities, reports] = await Promise.all([
    db.activity.findMany({
      where: upcomingActivityWhere(now),
      orderBy: { startsAt: 'asc' },
      take: PER_KIND,
      select: { id: true, title: true, startsAt: true, isDemo: true },
    }),
    db.opportunity.findMany({
      where: openOpportunityWhere(now),
      orderBy: { publishedAt: { sort: 'desc', nulls: 'last' } },
      take: PER_KIND,
      select: { id: true, title: true, publishedAt: true, isDemo: true },
    }),
    db.report.findMany({
      where: { isPublished: true },
      orderBy: [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { periodEnd: 'desc' }],
      take: PER_KIND,
      select: { id: true, title: true, publishedAt: true },
    }),
  ]);
  return [
    ...activities.map((a) => ({ kind: 'activity' as const, id: a.id, title: a.title, href: `/activities/${a.id}`, date: a.startsAt, isDemo: a.isDemo })),
    ...opportunities.map((o) => ({ kind: 'opportunity' as const, id: o.id, title: o.title, href: `/opportunities/${o.id}`, date: o.publishedAt, isDemo: o.isDemo })),
    ...reports.map((r) => ({ kind: 'report' as const, id: r.id, title: r.title, href: `/transparency/reports/${r.id}`, date: r.publishedAt, isDemo: false })),
  ];
}
