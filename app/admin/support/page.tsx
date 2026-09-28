import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import type { InquiryStatus } from '@/lib/generated/prisma/enums';
import { Markdown } from '@/lib/markdown';
import { guardPage } from '@/lib/page-guard';
import { can, type SessionUser } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';
import { answerInquiryAction, assignInquiryAction, closeInquiryAction } from '@/server/actions/support';
import { ActionButtons } from '@/components/shared/action-buttons';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, Forbidden } from '@/components/shared/states';
import { StatTile } from '@/components/shared/stat-tile';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/form-controls';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'الدعم والاستفسارات' };

const STATUS_LABELS: Record<InquiryStatus, string> = { NEW: 'جديد', IN_PROGRESS: 'قيد المتابعة', ANSWERED: 'رُدّ عليه', CLOSED: 'مغلق' };
const STATUSES = Object.keys(STATUS_LABELS) as InquiryStatus[];
const OPEN: InquiryStatus[] = ['NEW', 'IN_PROGRESS'];

type Search = { status?: string; inquiry?: string };

// /admin/support — PRD §13.4. «أسئلة بلا إجابة» أهم قائمة: كل سطر فجوة معرفية.
// لا يُعرض اسم صاحب الاستفسار (تقليل البيانات): يصله الرد إشعارًا، والزائر بوسيلة التواصل التي تركها فقط.
export default async function SupportPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { user, allowed, backHref } = await guardPage('/admin/support', 'support:read');
  if (!allowed) return <Forbidden backHref={backHref} />;
  if (params.inquiry) return <InquiryDetail user={user} id={params.inquiry} />;

  const status = STATUSES.includes(params.status as InquiryStatus) ? (params.status as InquiryStatus) : null;
  const [faqTotal, faqActive, newCount, inProgress, gaps, popular, inquiries] = await Promise.all([
    db.faqEntry.count(),
    db.faqEntry.count({ where: { isActive: true } }),
    db.supportInquiry.count({ where: { status: 'NEW' } }),
    db.supportInquiry.count({ where: { status: 'IN_PROGRESS' } }),
    db.supportInquiry.findMany({
      where: { matchedFaqId: null, status: { in: OPEN } },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: { id: true, question: true, createdAt: true },
    }),
    db.faqEntry.findMany({
      where: { isActive: true },
      orderBy: { useCount: 'desc' },
      take: 8,
      select: { id: true, question: true, useCount: true },
    }),
    db.supportInquiry.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, question: true, status: true, createdAt: true, assignee: { select: { fullName: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader title="الدعم والاستفسارات" description="ما لم يجد له البوت إجابة معتمدة، والأسئلة الأكثر طلبًا.">
        {can(user, 'faq:manage') ? (
          <Button asChild variant="outline">
            <Link href="/admin/settings/faq">قاعدة الأسئلة</Link>
          </Button>
        ) : null}
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="إجمالي الأسئلة" value={faqTotal} emptyWhenZero />
        <StatTile label="الأسئلة النشطة" value={faqActive} tone="success" emptyWhenZero />
        <StatTile label="استفسارات جديدة" value={newCount} tone="brand" href="/admin/support?status=NEW" />
        <StatTile label="بانتظار رد" value={inProgress} tone="warning" href="/admin/support?status=IN_PROGRESS" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>أسئلة بلا إجابة ({gaps.length})</CardTitle>
            <CardDescription>لم يطابقها أي سؤال معتمد — كل سطر فجوة في قاعدة الأسئلة. الرد مع «إضافة إلى FAQ» يسدّها.</CardDescription>
          </CardHeader>
          <CardContent>
            {gaps.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا فجوات مفتوحة. كل الاستفسارات المفتوحة وجدت سؤالًا قريبًا.</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border text-sm">
                {gaps.map((g) => (
                  <li key={g.id} className="flex items-start justify-between gap-3 p-3">
                    <Link href={`/admin/support?inquiry=${g.id}`} className="line-clamp-2 text-brand hover:underline">
                      {g.question}
                    </Link>
                    <time className="shrink-0 text-xs text-muted-foreground">{formatDateTime(g.createdAt)}</time>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>أكثر الأسئلة تكرارًا</CardTitle>
          </CardHeader>
          <CardContent>
            {popular.every((p) => p.useCount === 0) ? (
              <p className="text-sm text-muted-foreground">لم يعرض البوت أي إجابة بعد.</p>
            ) : (
              <ol className="flex list-decimal flex-col gap-1 ps-5 text-sm">
                {popular.map((p) => (
                  <li key={p.id}>
                    {p.question} <span className="text-xs text-muted-foreground">({p.useCount})</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="mt-6 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">الاستفسارات</h2>
          <nav aria-label="تصفية بالحالة" className="flex flex-wrap gap-1 text-sm">
            {[null, ...STATUSES].map((s) => (
              <Link
                key={s ?? 'all'}
                href={s ? `/admin/support?status=${s}` : '/admin/support'}
                aria-current={s === status ? 'page' : undefined}
                className="rounded-lg px-2 py-1 hover:bg-muted aria-[current=page]:bg-brand-soft aria-[current=page]:font-medium"
              >
                {s ? STATUS_LABELS[s] : 'الكل'}
              </Link>
            ))}
          </nav>
        </div>
        <DataTable
          rows={inquiries}
          rowKey={(r) => r.id}
          empty={
            status
              ? { title: 'لا استفسارات بهذه الحالة', hint: 'اختر حالة أخرى أو «الكل».' }
              : { title: 'لا استفسارات بعد', hint: 'حين لا يجد البوت إجابة ويرسل صاحب السؤال استفساره، يظهر هنا فورًا.' }
          }
          columns={[
            {
              key: 'q',
              header: 'الاستفسار',
              cell: (r) => (
                <Link href={`/admin/support?inquiry=${r.id}`} className="line-clamp-2 text-brand hover:underline">
                  {r.question}
                </Link>
              ),
            },
            { key: 'status', header: 'الحالة', cell: (r) => STATUS_LABELS[r.status] },
            { key: 'assignee', header: 'المسؤول', cell: (r) => r.assignee?.fullName ?? '—' },
            { key: 'date', header: 'التاريخ', cell: (r) => formatDateTime(r.createdAt) },
          ]}
        />
      </section>
    </>
  );
}

async function InquiryDetail({ user, id }: { user: SessionUser; id: string }) {
  const back = (
    <Button asChild variant="outline">
      <Link href="/admin/support">عودة للاستفسارات</Link>
    </Button>
  );
  const inquiry = /^[0-9a-f-]{36}$/i.test(id)
    ? await db.supportInquiry.findUnique({
        where: { id },
        select: {
          id: true,
          question: true,
          status: true,
          askerId: true,
          contactHint: true,
          answerMd: true,
          answeredAt: true,
          promotedToFaq: true,
          createdAt: true,
          matchedFaq: { select: { question: true } },
          assignee: { select: { fullName: true } },
          answeredBy: { select: { fullName: true } },
        },
      })
    : null;
  if (!inquiry) {
    return (
      <>
        <PageHeader title="الاستفسار غير موجود">{back}</PageHeader>
        <Card>
          <EmptyState title="لم نجد هذا الاستفسار" hint="ربما الرابط قديم. عد إلى القائمة واختر منها." />
        </Card>
      </>
    );
  }
  const open = OPEN.includes(inquiry.status);
  const respond = can(user, 'support:respond') && open;
  const categories = can(user, 'faq:manage')
    ? await db.faqCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, nameAr: true } })
    : [];

  return (
    <>
      <PageHeader
        title="استفسار"
        description={`${STATUS_LABELS[inquiry.status]} · ${formatDateTime(inquiry.createdAt)} · ${inquiry.askerId ? 'من مستخدم مسجّل (يصله الرد إشعارًا)' : 'من زائر'}`}
      >
        {back}
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <p className="whitespace-pre-line text-sm leading-7">{inquiry.question}</p>
            {inquiry.matchedFaq ? (
              <p className="mt-3 text-xs text-muted-foreground">عرض له البوت «{inquiry.matchedFaq.question}» وقال إنها لم تفده.</p>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">لم يجد له البوت أي سؤال معتمد قريب.</p>
            )}
            {!inquiry.askerId ? (
              <p className="mt-2 text-xs">
                وسيلة التواصل التي تركها: <span className="font-medium">{inquiry.contactHint ?? 'لم يترك وسيلة — لا يصله الرد إلا إن أضيف للأسئلة الشائعة'}</span>
              </p>
            ) : null}
          </Card>
          {inquiry.answerMd ? (
            <Card>
              <CardHeader>
                <CardTitle>الرد</CardTitle>
                <CardDescription>
                  {inquiry.answeredBy?.fullName} · {formatDateTime(inquiry.answeredAt)}
                  {inquiry.promotedToFaq ? ' · أُضيف إلى الأسئلة الشائعة' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Markdown text={inquiry.answerMd} />
              </CardContent>
            </Card>
          ) : null}
          {respond ? (
            <Card>
              <CardHeader>
                <CardTitle>الرد على الاستفسار</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={answerInquiryAction}>
                  <input type="hidden" name="inquiryId" value={inquiry.id} />
                  <Field name="answer" label="الرد" hint="يدعم **عريض** والقوائم (- بند) والروابط [نص](/track). يصل صاحبه إشعارًا وبريدًا.">
                    <Textarea rows={6} maxLength={5000} required />
                  </Field>
                  {categories.length > 0 ? (
                    <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
                      <legend className="px-1 text-sm font-medium">إضافة إلى الأسئلة الشائعة (اختياري)</legend>
                      <Label className="flex items-center gap-2 font-normal">
                        <Checkbox name="promote" />
                        أضف هذا الرد سؤالًا معتمدًا يجده البوت
                      </Label>
                      <Field name="faqQuestion" label="نص السؤال" hint="اتركه فارغًا لاستعمال نص الاستفسار كما هو.">
                        <Input maxLength={300} />
                      </Field>
                      <Field name="categoryId" label="التصنيف">
                        <Select defaultValue="">
                          <option value="">— اختر —</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nameAr}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field name="keywords" label="كلمات مفتاحية" hint="مفصولة بفواصل — أول ما يبحث فيه البوت.">
                        <Input maxLength={600} />
                      </Field>
                    </fieldset>
                  ) : null}
                  <SubmitButton className="self-start">إرسال الرد</SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          ) : null}
        </div>
        <Card className="h-fit p-4">
          <p className="text-sm">
            المسؤول: <span className="font-medium">{inquiry.assignee?.fullName ?? 'لم يُسند بعد'}</span>
          </p>
          {respond ? (
            <div className="mt-3">
              <ActionButtons
                items={[
                  ...(inquiry.status === 'NEW' ? [{ action: assignInquiryAction, fields: { inquiryId: inquiry.id }, label: 'أتولّاه' }] : []),
                  { action: closeInquiryAction, fields: { inquiryId: inquiry.id }, label: 'إغلاق بلا رد' },
                ]}
              />
              <p className="mt-2 text-xs text-muted-foreground">الإغلاق بلا رد للمكرر أو غير المفهوم أو المسيء.</p>
            </div>
          ) : !open ? null : (
            <p className="mt-2 text-xs text-muted-foreground">عرض فقط — الرد لمن يملك صلاحية الرد على الاستفسارات.</p>
          )}
        </Card>
      </div>
    </>
  );
}
