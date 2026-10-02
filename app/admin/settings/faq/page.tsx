import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import type { Prisma } from '@/lib/generated/prisma/client';
import { Markdown } from '@/lib/markdown';
import { guardPage } from '@/lib/page-guard';
import { saveFaqAction, setFaqActiveAction } from '@/server/actions/faq';
import { ActionButtons } from '@/components/shared/action-buttons';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, Forbidden } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/form-controls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'قاعدة الأسئلة المعتمدة' };

type Search = { q?: string; category?: string; state?: string; faq?: string };

// /admin/settings/faq — faq:manage (PRD §13.4 · §13.5). البوت لا يجيب إلا من هنا، فكل تغيير بسطر تدقيق (AC-18 ⑥).
export default async function FaqSettingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { allowed, backHref } = await guardPage('/admin/settings/faq', 'faq:manage');
  if (!allowed) return <Forbidden backHref={backHref} />;

  const q = params.q?.trim() ?? '';
  const filters: Prisma.FaqEntryWhereInput[] = [];
  if (q) filters.push({ OR: [{ question: { contains: q, mode: 'insensitive' } }, { keywords: { has: q } }] });
  if (params.category && /^[0-9a-f-]{36}$/i.test(params.category)) filters.push({ categoryId: params.category });
  if (params.state === 'active') filters.push({ isActive: true });
  if (params.state === 'disabled') filters.push({ isActive: false });

  const editing = params.faq && /^[0-9a-f-]{36}$/i.test(params.faq) ? params.faq : null;
  const [categories, entries, current] = await Promise.all([
    db.faqCategory.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, nameAr: true } }),
    db.faqEntry.findMany({
      where: filters.length ? { AND: filters } : {},
      orderBy: [{ category: { sortOrder: 'asc' } }, { createdAt: 'asc' }],
      select: { id: true, question: true, answerMd: true, keywords: true, isActive: true, useCount: true, category: { select: { nameAr: true } } },
    }),
    editing
      ? db.faqEntry.findUnique({ where: { id: editing }, select: { id: true, categoryId: true, question: true, answerMd: true, keywords: true } })
      : null,
  ]);
  const filtered = !!(q || params.category || params.state);

  return (
    <>
      <PageHeader
        title="قاعدة الأسئلة المعتمدة"
        description="البوت لا يجيب إلا من هذه الأسئلة النشطة. التعطيل يُخفي السؤال عن البوت وصفحة المساعدة فورًا."
      >
        <Button asChild variant="outline">
          <Link href="/admin/support">الاستفسارات</Link>
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-3">
          <Card className="p-3">
            <form action="/admin/settings/faq" role="search" className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end">
              <div className="flex flex-col gap-1">
                <Label htmlFor="q">بحث</Label>
                <Input id="q" name="q" defaultValue={q} placeholder="نص السؤال أو كلمة مفتاحية" />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="category">التصنيف</Label>
                <Select id="category" name="category" defaultValue={params.category ?? ''}>
                  <option value="">الكل</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameAr}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="state">الحالة</Label>
                <Select id="state" name="state" defaultValue={params.state ?? ''}>
                  <option value="">الكل</option>
                  <option value="active">نشط</option>
                  <option value="disabled">معطّل</option>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button type="submit">تصفية</Button>
                {filtered ? (
                  <Button asChild variant="ghost">
                    <Link href="/admin/settings/faq">مسح</Link>
                  </Button>
                ) : null}
              </div>
            </form>
          </Card>

          {entries.length === 0 ? (
            <Card>
              <EmptyState
                title={filtered ? 'لا نتائج لهذه التصفية' : 'لا أسئلة بعد'}
                hint={filtered ? 'غيّر البحث أو التصنيف أو الحالة.' : 'أضف أول سؤال من النموذج المجاور، أو من الرد على استفسار.'}
              />
            </Card>
          ) : (
            <ul className="flex flex-col gap-2">
              {entries.map((e) => (
                <li key={e.id}>
                  <Card className={e.isActive ? 'p-3' : 'p-3 opacity-70'}>
                    <details>
                      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-medium">{e.question}</span>
                        <span className="text-xs text-muted-foreground">
                          {e.category.nameAr} · {e.isActive ? 'نشط' : 'معطّل'} · عُرض {e.useCount}
                        </span>
                      </summary>
                      <div className="mt-3 flex flex-col gap-3">
                        <Markdown text={e.answerMd} />
                        {e.keywords.length ? <p className="text-xs text-muted-foreground">كلمات مفتاحية: {e.keywords.join('، ')}</p> : null}
                        <div className="flex flex-wrap items-start gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/admin/settings/faq?faq=${e.id}`}>تعديل</Link>
                          </Button>
                          <ActionButtons
                            items={[
                              {
                                action: setFaqActiveAction,
                                fields: { faqId: e.id, active: e.isActive ? 'false' : 'true' },
                                label: e.isActive ? 'تعطيل' : 'تفعيل',
                              },
                            ]}
                          />
                        </div>
                      </div>
                    </details>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle>{current ? 'تعديل سؤال' : 'سؤال جديد'}</CardTitle>
          </CardHeader>
          <CardContent>
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا تصنيفات. شغّل البذرة الأساسية لإنشاء تصنيفات الأسئلة.</p>
            ) : (
              <ActionForm key={current?.id ?? 'new'} action={saveFaqAction} resetOnSuccess={!current}>
                {current ? <input type="hidden" name="faqId" value={current.id} /> : null}
                <Field name="categoryId" label="التصنيف">
                  <Select defaultValue={current?.categoryId ?? categories[0]!.id}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameAr}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field name="question" label="السؤال">
                  <Input required maxLength={300} defaultValue={current?.question} />
                </Field>
                <Field name="answer" label="الإجابة المعتمدة" hint="يدعم **عريض** و*مائل* والقوائم (- بند) والروابط [نص](/track). لا HTML.">
                  <Textarea rows={7} required maxLength={5000} defaultValue={current?.answerMd} />
                </Field>
                <Field name="keywords" label="كلمات مفتاحية" hint="مفصولة بفواصل. تطابقها الكامل يسبق أي تطابق آخر.">
                  <Input maxLength={600} defaultValue={current?.keywords.join('، ')} />
                </Field>
                <div className="flex gap-2">
                  <SubmitButton>{current ? 'حفظ التعديل' : 'إضافة'}</SubmitButton>
                  {current ? (
                    <Button asChild variant="ghost">
                      <Link href="/admin/settings/faq">إلغاء</Link>
                    </Button>
                  ) : null}
                </div>
              </ActionForm>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
