import type { Metadata } from 'next';
import Link from 'next/link';
import { ACTIVITY_STATUS_LABELS, ACTIVITY_TRANSITIONS, SEAT_HOLDING } from '@/lib/activities/workflow';
import { db } from '@/lib/db';
import { guardPage } from '@/lib/page-guard';
import { can, scopeFilter, type PermissionKey, type SessionUser } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';
import { setActivityStatusAction } from '@/server/actions/activities';
import { ActivityForm } from '@/components/activities/activity-form';
import { ActionButtons } from '@/components/shared/action-buttons';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'إدارة الأنشطة' };

/** اللجان التي يملك فيها المستخدم الصلاحية: كل اللجان لنطاق «الكل»، وإلا لجان منحته */
async function committeesWith(user: SessionUser, key: PermissionKey) {
  const scope = scopeFilter(user, key);
  if (!scope) return [];
  return db.committee.findMany({
    where: scope.all ? {} : { id: { in: scope.committees } },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, nameAr: true },
  });
}

// /admin/activities — activities:update بنطاق لجنة النشاط أو الكل. الإنشاء بـ activities:create (D34: بلجنة).
export default async function AdminActivitiesPage() {
  const { user, allowed, backHref } = await guardPage('/admin/activities', 'activities:update');
  if (!allowed) return <Forbidden backHref={backHref} />;
  const scope = scopeFilter(user, 'activities:update')!;

  const [activities, createCommittees, updateCommittees, areas, organizations] = await Promise.all([
    db.activity.findMany({
      where: scope.all ? {} : { committeeId: { in: scope.committees } },
      orderBy: { startsAt: 'desc' },
      take: 100,
      select: {
        id: true,
        title: true,
        description: true,
        kind: true,
        status: true,
        committeeId: true,
        startsAt: true,
        endsAt: true,
        location: true,
        areaId: true,
        seats: true,
        registrationOpen: true,
        outcomes: true,
        committee: { select: { nameAr: true } },
        partners: { select: { organizationId: true } },
        _count: { select: { registrations: { where: { status: { in: SEAT_HOLDING } } } } },
      },
    }),
    committeesWith(user, 'activities:create'),
    committeesWith(user, 'activities:update'),
    db.area.findMany({ orderBy: { nameAr: 'asc' }, select: { id: true, nameAr: true } }),
    db.organization.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  const opts = (rows: { id: string; nameAr: string }[]) => rows.map((r) => ({ id: r.id, name: r.nameAr }));
  const waitlisted = await db.activityRegistration.groupBy({
    by: ['activityId'],
    where: { activityId: { in: activities.map((a) => a.id) }, status: 'WAITLISTED' },
    _count: true,
  });
  const waitBy = new Map(waitlisted.map((w) => [w.activityId, w._count]));

  return (
    <>
      <PageHeader title="إدارة الأنشطة" description="أنشئ النشاط مسودة، وانشره حين يكتمل. الحضور تسجّله اللجنة المنظِّمة بعد بدء النشاط." />
      {createCommittees.length > 0 ? (
        <Card className="mb-5">
          <details>
            <summary className="cursor-pointer p-4 font-semibold text-brand sm:p-5">نشاط جديد</summary>
            <CardContent>
              <ActivityForm committees={opts(createCommittees)} areas={opts(areas)} organizations={organizations} />
            </CardContent>
          </details>
        </Card>
      ) : null}

      {activities.length === 0 ? (
        <Card>
          <EmptyState title="لا أنشطة بعد" hint="أنشئ أول نشاط أو ورشة للجنتك من «نشاط جديد»، ثم انشره ليظهر للشباب في صفحة الأنشطة." />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {activities.map((a) => (
            <li key={a.id}>
              <Card>
                <CardHeader className="gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="flex flex-col gap-0.5">
                      <CardTitle>
                        {a.status === 'DRAFT' || a.status === 'CANCELLED' ? (
                          a.title
                        ) : (
                          <Link href={`/activities/${a.id}`} className="text-brand hover:underline">
                            {a.title}
                          </Link>
                        )}
                      </CardTitle>
                      <span className="text-xs text-muted-foreground">
                        {a.committee?.nameAr} · {formatDateTime(a.startsAt)} · {a._count.registrations}
                        {a.seats !== null ? ` / ${a.seats}` : ''} مسجّل
                        {waitBy.get(a.id) ? ` · ${waitBy.get(a.id)} في الانتظار` : ''}
                      </span>
                    </span>
                    <StatusBadge kind="activity" status={a.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ActionButtons
                      items={ACTIVITY_TRANSITIONS[a.status].map((to) => ({
                        action: setActivityStatusAction,
                        fields: { activityId: a.id, toStatus: to },
                        label: to === 'PUBLISHED' ? 'نشر' : `نقل إلى «${ACTIVITY_STATUS_LABELS[to]}»`,
                        variant: to === 'PUBLISHED' ? 'default' : 'outline',
                      }))}
                    />
                    {can(user, 'activities:attendance', { committeeId: a.committeeId }) && a.status !== 'DRAFT' ? (
                      <Link href={`/admin/activities/${a.id}/attendance`} className="text-sm text-brand hover:underline">
                        الحضور والتقييم
                      </Link>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent>
                  <details>
                    <summary className="cursor-pointer text-sm text-brand">تعديل النشاط ومخرجاته</summary>
                    <div className="mt-3">
                      <ActivityForm
                        activity={{ ...a, partnerIds: a.partners.map((p) => p.organizationId) }}
                        committees={opts(updateCommittees)}
                        areas={opts(areas)}
                        organizations={organizations}
                      />
                    </div>
                  </details>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
