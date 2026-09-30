import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import type { Prisma } from '@/lib/generated/prisma/client';
import { guardPage } from '@/lib/page-guard';
import { can, scopeFilter, type SessionUser } from '@/lib/rbac';
import { cn, formatDate } from '@/lib/utils';
import { approveConceptNoteAction, createPollAction, editConceptNoteAction, markConceptNoteSentAction, setThresholdAction } from '@/server/actions/demand';
import { saveInitiativeAction } from '@/server/actions/initiatives';
import { ActionButtons } from '@/components/shared/action-buttons';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, Forbidden } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status-badge';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/form-controls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'المبادرات' };

// /admin/initiatives — initiatives:update. تبويبا «الطلب» و «Concept Note» هنا لأن §11.2 لا يعرّف لهما مسارًا (D30):
// استطلاعات الطلب لـ demand:manage، والمسودات لـ concept_notes:approve — كل تبويب بصلاحيته.
const TABS = [
  { key: 'list', label: 'المبادرات', permission: 'initiatives:update' },
  { key: 'demand', label: 'استطلاعات الطلب', permission: 'demand:manage' },
  { key: 'notes', label: 'مسودات Concept Note', permission: 'concept_notes:approve' },
] as const;

export default async function AdminInitiativesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const { user, allowed, backHref } = await guardPage('/admin/initiatives', ['initiatives:update', 'demand:manage', 'concept_notes:approve']);
  if (!allowed) return <Forbidden backHref={backHref} />;
  const tabs = TABS.filter((t) => can(user, t.permission));
  const current = tabs.find((t) => t.key === tab) ?? tabs[0]!;

  return (
    <>
      <PageHeader title="المبادرات" description="من الفكرة المعتمدة إلى مبادرة باحتياجات مرقّمة، ومن طلب الشباب إلى مقترح تدريب." />
      {tabs.length > 1 ? (
        <nav aria-label="أقسام الصفحة" className="mb-4 flex gap-1 overflow-x-auto border-b">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/admin/initiatives?tab=${t.key}`}
              aria-current={t.key === current.key ? 'page' : undefined}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap',
                t.key === current.key ? 'border-brand font-medium text-brand' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      ) : null}
      {current.key === 'list' ? <InitiativesTab user={user} /> : null}
      {current.key === 'demand' ? <DemandTab /> : null}
      {current.key === 'notes' ? <NotesTab /> : null}
    </>
  );
}

async function InitiativesTab({ user }: { user: SessionUser }) {
  const scope = scopeFilter(user, 'initiatives:update');
  const where: Prisma.InitiativeWhereInput = scope?.all ? {} : { committeeId: { in: scope?.committees ?? [] } };
  const createScope = scopeFilter(user, 'initiatives:create');
  const [rows, committees, ideas] = await Promise.all([
    db.initiative.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        progressPct: true,
        updatedAt: true,
        committee: { select: { nameAr: true } },
        _count: { select: { offers: { where: { status: 'SUBMITTED' } } } },
      },
    }),
    createScope
      ? db.committee.findMany({
          where: { isActive: true, ...(createScope.all ? {} : { id: { in: createScope.committees } }) },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, nameAr: true },
        })
      : [],
    createScope
      ? db.idea.findMany({
          where: { status: 'APPROVED', initiativeId: null, ...(createScope.all ? {} : { committeeId: { in: createScope.committees } }) },
          select: { id: true, reference: true, title: true },
        })
      : [],
  ]);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty={{ title: 'لا مبادرات بعد', hint: 'أنشئ مبادرة من فكرة معتمدة أو مباشرةً، ثم أضف احتياجاتها المرقّمة.' }}
        columns={[
          {
            key: 'title',
            header: 'المبادرة',
            cell: (r) => (
              <Link href={`/admin/initiatives/${r.id}`} className="font-medium text-brand hover:underline">
                {r.title}
              </Link>
            ),
          },
          { key: 'status', header: 'الحالة', cell: (r) => <StatusBadge kind="initiative" status={r.status} /> },
          { key: 'offers', header: 'عروض جديدة', cell: (r) => (r._count.offers ? <strong>{r._count.offers}</strong> : '—') },
          { key: 'committee', header: 'اللجنة', className: 'hidden md:table-cell', cell: (r) => r.committee?.nameAr ?? '—' },
          { key: 'progress', header: 'الإنجاز', className: 'hidden sm:table-cell', cell: (r) => `${r.progressPct}٪` },
        ]}
      />
      {committees.length > 0 ? (
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>مبادرة جديدة</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveInitiativeAction} resetOnSuccess>
              {ideas.length > 0 ? (
                <Field name="ideaId" label="من فكرة معتمدة (اختياري)">
                  <Select defaultValue="">
                    <option value="">— مبادرة مستقلة —</option>
                    {ideas.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.title} ({i.reference})
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <Field name="title" label="العنوان">
                <Input maxLength={200} />
              </Field>
              <Field name="committeeId" label="اللجنة">
                <Select defaultValue={committees.length === 1 ? committees[0]!.id : ''}>
                  <option value="">— اختر —</option>
                  {committees.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameAr}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field name="summary" label="ملخص (يظهر للعامة)">
                <Textarea rows={2} maxLength={500} />
              </Field>
              <Field name="estimatedBudget" label="الميزانية التقديرية بالشيكل (اختيارية)">
                <Input inputMode="decimal" dir="ltr" />
              </Field>
              <SubmitButton>إنشاء مسودة</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

async function DemandTab() {
  const [polls, initiatives] = await Promise.all([
    db.demandPoll.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        isActive: true,
        proposalThreshold: true,
        closesAt: true,
        options: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, label: true, voteCount: true, conceptNote: { select: { status: true } } },
        },
        _count: { select: { votes: true } },
      },
    }),
    db.initiative.findMany({ where: { status: { notIn: ['CANCELLED', 'COMPLETED'] } }, select: { id: true, title: true } }),
  ]);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-3">
        {polls.length === 0 ? (
          <Card>
            <EmptyState title="لا استطلاعات بعد" hint="اطرح استطلاعًا لمجالات التدريب، وحدّد عدد الأصوات الذي يولّد مقترحًا." />
          </Card>
        ) : (
          polls.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle>{p.title}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {p._count.votes} مصوّت · {p.isActive ? 'مفتوح' : 'مغلق'}
                  {p.closesAt ? ` · يُغلق ${formatDate(p.closesAt)}` : ''}
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ul className="flex flex-col gap-1 text-sm">
                  {p.options.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2">
                      <span>{o.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {o.voteCount} / {p.proposalThreshold}
                        {o.conceptNote ? ' · مسودة مقترح' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                <ActionForm action={setThresholdAction} className="gap-2 sm:flex-row sm:items-end">
                  <input type="hidden" name="pollId" value={p.id} />
                  <Field name="proposalThreshold" label="حد المقترح">
                    <Input type="number" min={2} defaultValue={p.proposalThreshold} className="w-28" />
                  </Field>
                  <div className="flex items-center gap-2 pb-2">
                    <Checkbox id={`active-${p.id}`} name="isActive" defaultChecked={p.isActive} />
                    <Label htmlFor={`active-${p.id}`}>مفتوح</Label>
                  </div>
                  <SubmitButton size="sm" variant="outline">
                    حفظ
                  </SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>استطلاع جديد</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={createPollAction} resetOnSuccess>
            <Field name="title" label="العنوان">
              <Input maxLength={200} defaultValue="فرصة عمل... كيف أكون؟" />
            </Field>
            <Field name="description" label="وصف (اختياري)">
              <Textarea rows={2} maxLength={2000} />
            </Field>
            <Field name="options" label="المجالات" hint="كل مجال في سطر، خياران على الأقل.">
              <Textarea rows={4} />
            </Field>
            <Field name="proposalThreshold" label="حد المقترح (عدد الأصوات)">
              <Input type="number" min={2} defaultValue={50} />
            </Field>
            <Field name="closesAt" label="تاريخ الإغلاق (اختياري)">
              <Input type="date" />
            </Field>
            {initiatives.length > 0 ? (
              <Field name="initiativeId" label="مرتبط بمبادرة (اختياري)">
                <Select defaultValue="">
                  <option value="">— بلا ربط —</option>
                  {initiatives.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <SubmitButton>نشر الاستطلاع</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}

async function NotesTab() {
  const notes = await db.conceptNote.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      bodyMd: true,
      status: true,
      voterCount: true,
      approvedAt: true,
      sentAt: true,
      createdAt: true,
      approvedBy: { select: { fullName: true } },
      demandOption: { select: { label: true, poll: { select: { title: true } } } },
    },
  });
  if (notes.length === 0) {
    return (
      <Card>
        <EmptyState title="لا مسودات بعد" hint="تُنشأ المسودة تلقائيًا حين يبلغ مجال تدريب حد المقترح في استطلاع الطلب." />
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {notes.map((n) => {
        const editable = n.status === 'DRAFT' || n.status === 'IN_REVIEW';
        return (
          <Card key={n.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>{n.title}</CardTitle>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {n.status === 'SENT' ? `أُرسل ${formatDate(n.sentAt)}` : n.approvedAt ? `معتمد — ${n.approvedBy?.fullName ?? ''}` : 'مسودة — لا تُرسل قبل الاعتماد'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {n.demandOption ? `${n.demandOption.poll.title} · ${n.demandOption.label} · ` : ''}
                {n.voterCount ?? 0} مصوّتًا · {formatDate(n.createdAt)}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {editable ? (
                <ActionForm action={editConceptNoteAction}>
                  <input type="hidden" name="conceptNoteId" value={n.id} />
                  <Field name="title" label="العنوان">
                    <Input defaultValue={n.title} maxLength={200} />
                  </Field>
                  <Field name="bodyMd" label="نص المقترح">
                    <Textarea defaultValue={n.bodyMd} rows={12} className="font-mono text-xs" dir="auto" />
                  </Field>
                  <SubmitButton variant="outline" size="sm">
                    حفظ المسودة
                  </SubmitButton>
                </ActionForm>
              ) : (
                <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap" dir="auto">
                  {n.bodyMd}
                </pre>
              )}
              <ActionButtons
                items={[
                  ...(editable ? [{ action: approveConceptNoteAction, fields: { conceptNoteId: n.id }, label: 'اعتماد المقترح', variant: 'default' as const }] : []),
                  ...(n.status === 'APPROVED' ? [{ action: markConceptNoteSentAction, fields: { conceptNoteId: n.id }, label: 'تعليمه «أُرسل»' }] : []),
                ]}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
