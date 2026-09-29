import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { Markdown } from '@/lib/markdown';
import { can } from '@/lib/rbac';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/states';
import { SupportBotWidget } from '@/components/support/support-bot-widget';
import { Card } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'المساعدة' };
export const dynamic = 'force-dynamic';

// /help — الأسئلة الشائعة + بوت الاستفسارات (PRD §11.2 · §13). عام بلا تسجيل دخول.
// لا يُعرض إلا FaqEntry نشط في تصنيف نشط (AC-18 ⑤)، والإجابات تمرّ بالمُنقّي (§6.3).
export default async function HelpPage() {
  const [user, categories, popular] = await Promise.all([
    getCurrentUser(),
    db.faqCategory.findMany({
      where: { isActive: true, entries: { some: { isActive: true } } },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        nameAr: true,
        entries: { where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true, question: true, answerMd: true } },
      },
    }),
    db.faqEntry.findMany({
      where: { isActive: true, category: { isActive: true } },
      orderBy: [{ useCount: 'desc' }, { createdAt: 'asc' }],
      take: 5,
      select: { question: true },
    }),
  ]);
  const faqEmpty = categories.length === 0;

  return (
    <>
      <PageHeader
        title="المساعدة"
        description="اسأل البوت عن المجلس والمنصة: يجيب من أسئلة اعتمدها المجلس فقط، وما لا يجد له إجابة يصل لفريق المجلس ليرد عليه."
      />
      <div className="flex flex-col gap-6">
        <SupportBotWidget
          suggestedQuestions={popular.map((p) => p.question)}
          isAuthenticated={!!user}
          canSend={!user || can(user, 'support:ask')}
          faqEmpty={faqEmpty}
        />
        <section className="flex flex-col gap-4" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="text-base font-semibold">
            الأسئلة الشائعة
          </h2>
          {faqEmpty ? (
            <Card>
              <EmptyState title="لا أسئلة معتمدة بعد" hint="يضيف المجلس الأسئلة الشائعة تباعًا. أرسل سؤالك من النموذج أعلاه." />
            </Card>
          ) : (
            categories.map((c) => (
              <div key={c.id} className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-muted-foreground">{c.nameAr}</h3>
                <Card className="divide-y">
                  {c.entries.map((e) => (
                    <details key={e.id} className="p-3">
                      <summary className="cursor-pointer text-sm font-medium">{e.question}</summary>
                      <Markdown text={e.answerMd} className="mt-2 flex flex-col gap-2 text-sm leading-7 text-foreground/90" />
                    </details>
                  ))}
                </Card>
              </div>
            ))
          )}
        </section>
      </div>
    </>
  );
}
