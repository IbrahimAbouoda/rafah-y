import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatBytes } from '@/lib/files';
import { guardPage } from '@/lib/page-guard';
import { formatDate, formatDateTime } from '@/lib/utils';
import { ComplaintActionsPanel } from '@/components/complaints/admin-actions';
import { ContactReveal } from '@/components/complaints/contact-reveal';
import { FileDownload } from '@/components/complaints/file-download';
import { WorkflowTimeline } from '@/components/complaints/workflow-timeline';
import { CreateTaskForm } from '@/components/tasks/create-task-form';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';
import { complaintFile } from '@/lib/complaints/queries';

export const metadata: Metadata = { title: 'ملف شكوى' };

const TARGETS: Record<string, string> = {
  MUNICIPALITY: 'البلدية',
  ORGANIZATION: 'مؤسسة',
  GOVERNMENT: 'جهة حكومية',
  LEGAL: 'جهة قانونية',
  OTHER: 'أخرى',
};

export default async function ComplaintFilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, allowed, backHref } = await guardPage(`/admin/complaints/${id}`, 'complaints:read', { beyondOwn: true });
  if (!allowed) return <Forbidden backHref={backHref} />;
  const file = await complaintFile(user, id);
  // شكوى خارج نطاقه = غير موجودة، فلا يكشف التخمين وجودها (AC-04 ①)
  if (!file) notFound();
  const { complaint, actions, canContact, taskMembers, submitterLabel } = file;

  return (
    <>
      <PageHeader title={complaint.title} description={`مقدّمها: ${submitterLabel}`}>
        <StatusBadge kind="complaint" status={complaint.status} size="md" />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="grid gap-2 pt-4 text-sm sm:grid-cols-2 sm:pt-5">
              <p>
                <span className="text-muted-foreground">الرقم: </span>
                <span className="font-mono" dir="ltr">
                  {complaint.reference}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">وصلت: </span>
                {formatDateTime(complaint.createdAt)}
              </p>
              <p>
                <span className="text-muted-foreground">التصنيف: </span>
                {complaint.category?.nameAr ?? '—'}
              </p>
              <p>
                <span className="text-muted-foreground">المنطقة: </span>
                {complaint.area?.nameAr ?? '—'}
              </p>
              <p>
                <span className="text-muted-foreground">اللجنة: </span>
                {complaint.committee?.nameAr ?? 'لم تُحوَّل بعد'}
              </p>
              {complaint.followUpAt ? (
                <p className={complaint.followUpAt < new Date() ? 'text-danger' : undefined}>
                  <span className="text-muted-foreground">موعد المتابعة: </span>
                  {formatDate(complaint.followUpAt)}
                  {complaint.followUpAt < new Date() ? ' — متأخرة' : ''}
                </p>
              ) : null}
              {complaint.closedAt ? (
                <p>
                  <span className="text-muted-foreground">أُغلقت: </span>
                  {formatDateTime(complaint.closedAt)}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>نص الشكوى</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm whitespace-pre-line">{complaint.body}</p>
              {complaint.resolutionNote ? <Alert tone="success">الحل: {complaint.resolutionNote}</Alert> : null}
              {complaint.dismissReason ? <Alert tone="danger">سبب الاستبعاد: {complaint.dismissReason}</Alert> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>المسار والسجل</CardTitle>
            </CardHeader>
            <CardContent>
              <WorkflowTimeline
                mode="internal"
                currentStatus={complaint.status}
                events={complaint.events.map((e) => ({
                  id: e.id,
                  toStatus: e.toStatus,
                  note: e.note,
                  isPublic: e.isPublic,
                  at: e.createdAt,
                  actor: e.actor?.fullName ?? (complaint.isAnonymous ? 'مقدّم مجهول' : null),
                }))}
              />
            </CardContent>
          </Card>

          {complaint.referrals.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>الإحالات الخارجية</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {complaint.referrals.map((r) => (
                  <div key={r.id} className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">
                      {r.targetName} <span className="text-xs text-muted-foreground">· {TARGETS[r.target] ?? r.target}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      أُحيلت {formatDate(r.createdAt)}
                      {r.followUpAt ? ` · المتابعة ${formatDate(r.followUpAt)}` : ''}
                      {r.respondedAt ? ` · ردّت ${formatDate(r.respondedAt)}` : ' · بلا رد بعد'}
                    </p>
                    {r.note ? <p className="mt-1">{r.note}</p> : null}
                    {r.response ? <p className="mt-1 text-success">الرد: {r.response}</p> : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          {/* اللوحة تبقى معروضة دائمًا لتحمل نتيجة آخر إجراء، وتعرض «صلاحية عرض فقط» حين لا إجراء */}
          <ComplaintActionsPanel complaintId={complaint.id} actions={actions} />

          {complaint.tasks.length > 0 || taskMembers ? (
            <Card>
              <CardHeader>
                <CardTitle>مهام اللجنة على الشكوى</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {complaint.tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا مهام بعد. أنشئ مهمة وأسندها لعضو في اللجنة.</p>
                ) : (
                  <ul className="flex flex-col divide-y text-sm">
                    {complaint.tasks.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                        <span className="flex flex-col">
                          <span>{t.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {t.assignee?.fullName ?? 'غير مسندة'}
                            {t.dueAt ? ` · حتى ${formatDate(t.dueAt)}` : ''}
                          </span>
                        </span>
                        <StatusBadge kind="task" status={t.status} />
                      </li>
                    ))}
                  </ul>
                )}
                {taskMembers && complaint.committeeId ? (
                  taskMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">لا أعضاء في اللجنة لإسناد مهمة إليهم.</p>
                  ) : (
                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-brand">أنشئ مهمة من الشكوى</summary>
                      <div className="mt-3">
                        <CreateTaskForm
                          committeeId={complaint.committeeId}
                          members={taskMembers}
                          complaint={{ id: complaint.id, title: complaint.title }}
                        />
                      </div>
                    </details>
                  )
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>المرفقات</CardTitle>
            </CardHeader>
            <CardContent>
              {complaint.files.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا مرفقات مع هذه الشكوى.</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {complaint.files.map((f, i) => (
                    <li key={f.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span className="flex flex-col">
                        <span>مرفق {i + 1}</span>
                        <span className="text-xs text-muted-foreground">
                          {f.mimeType === 'application/pdf' ? 'PDF' : 'صورة'} · {formatBytes(f.sizeBytes)}
                        </span>
                      </span>
                      {f.scan === 'CLEAN' ? (
                        <FileDownload fileId={f.id} label={`مرفق ${i + 1}`} />
                      ) : (
                        <StatusBadge kind="file" status={f.scan} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {canContact && !complaint.isAnonymous && (complaint.submitterId || complaint.contact) ? (
            <Card>
              <CardHeader>
                <CardTitle>بيانات التواصل</CardTitle>
              </CardHeader>
              <CardContent>
                <ContactReveal complaintId={complaint.id} />
              </CardContent>
            </Card>
          ) : null}

          <Link href="/admin/complaints" className="text-sm text-brand hover:underline">
            العودة إلى الشكاوى
          </Link>
        </div>
      </div>
    </>
  );
}
