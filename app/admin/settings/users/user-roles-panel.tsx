import Link from 'next/link';
import { X } from 'lucide-react';
import { z } from 'zod';
import { assignmentStatus } from '@/lib/assignments';
import { db } from '@/lib/db';
import { formatDate } from '@/lib/utils';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surface';
import { AssignRoleForm, RevokeButton } from './role-forms';

export async function UserRolesPanel({ userId, actorId, closeHref }: { userId: string; actorId: string; closeHref: string }) {
  const valid = z.uuid().safeParse(userId).success;
  const user = valid
    ? await db.user.findFirst({
        where: { id: userId },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          isActive: true,
          roleAssignments: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              title: true,
              startsAt: true,
              endsAt: true,
              revokedAt: true,
              role: { select: { nameAr: true, isTermBound: true } },
              committee: { select: { nameAr: true } },
              term: { select: { name: true, isCurrent: true } },
            },
          },
        },
      })
    : null;

  if (!user) {
    return (
      <Card>
        <EmptyState title="المستخدم غير موجود" hint="ربما حُذف أو الرابط غير صحيح. اختر مستخدمًا من القائمة.">
          <Button asChild variant="outline" size="sm">
            <Link href={closeHref}>إغلاق</Link>
          </Button>
        </EmptyState>
      </Card>
    );
  }

  const [roles, committees, currentTerm] = await Promise.all([
    db.role.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, nameAr: true, requiresCommittee: true, isTermBound: true } }),
    db.committee.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, nameAr: true } }),
    db.councilTerm.findFirst({ where: { isCurrent: true }, select: { name: true } }),
  ]);
  const isSelf = user.id === actorId;

  return (
    <Card className="h-fit xl:sticky xl:top-20">
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>{user.fullName}</CardTitle>
          <CardDescription dir="ltr" className="text-end">
            {user.email ?? user.phone}
          </CardDescription>
        </div>
        <Button asChild variant="ghost" size="icon" aria-label="إغلاق">
          <Link href={closeHref}>
            <X aria-hidden />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">الأدوار</h3>
          {user.roleAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا أدوار بعد. عيّن أول دور من النموذج أدناه.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              {user.roleAssignments.map((a) => {
                const status = assignmentStatus(a);
                return (
                  <li key={a.id} className="flex items-start justify-between gap-2 p-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="text-sm font-medium">
                        {a.role.nameAr}
                        {a.committee ? ` — ${a.committee.nameAr}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.title ? `${a.title} · ` : ''}
                        {a.term ? `${a.term.name} · ` : ''}
                        من {formatDate(a.startsAt)}
                        {a.endsAt ? ` حتى ${formatDate(a.endsAt)}` : ''}
                      </p>
                      <StatusBadge kind="assignment" status={status} />
                    </div>
                    {status !== 'revoked' && !isSelf ? <RevokeButton assignmentId={a.id} roleName={a.role.nameAr} /> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3 border-t pt-4">
          <h3 className="text-sm font-semibold">تعيين دور</h3>
          {!currentTerm ? (
            <Alert tone="warning">
              لا توجد دورة مجلس حالية، فلا يمكن تعيين أدوار المجلس واللجان.{' '}
              <Link href="/admin/settings/terms" className="underline">
                أنشئ دورة
              </Link>
              .
            </Alert>
          ) : null}
          {!user.isActive ? (
            <Alert tone="warning">هذا الحساب معطّل ولا يمكن تعيين أدوار له.</Alert>
          ) : (
            <AssignRoleForm userId={user.id} roles={roles} committees={committees} />
          )}
        </section>
      </CardContent>
    </Card>
  );
}
