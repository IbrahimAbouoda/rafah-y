'use client';

import { useState, useTransition } from 'react';
import { Loader2, Search, Send } from 'lucide-react';
import { Markdown } from '@/lib/markdown';
import { askBotAction, markUnhelpfulAction, sendInquiryAction, type BotResult } from '@/server/actions/support';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/form-controls';
import { Alert, Card } from '@/components/ui/surface';

// SupportBotWidget — PRD §12 · §13. البوت يعرض نص FaqEntry معتمدًا أو يعترف بأنه لم يجد (§13.1) — لا نص مؤلَّف.
// الحالات: اقتراحات جاهزة · «جارٍ البحث» · نتيجة مطابقة و«هل أفادتك؟» · «لم أجد» مع «أرسل لفريق المجلس» · تأكيد الإرسال.
// قاعدة FAQ فارغة ⇒ نموذج إرسال مباشر · فشل البحث ⇒ زر الإرسال اليدوي لا رسالة تقنية.

type Stage =
  | { kind: 'idle' }
  | { kind: 'answered'; result: BotResult; question: string; feedback: 'none' | 'yes' }
  | { kind: 'notFound'; botQueryId: string | null; question: string; reason: 'nomatch' | 'unhelpful' | 'error' }
  | { kind: 'sent'; message: string };

export function SupportBotWidget({
  suggestedQuestions,
  isAuthenticated,
  canSend,
  faqEmpty,
}: {
  suggestedQuestions: string[];
  isAuthenticated: boolean;
  /** الزائر يرسل دائمًا؛ المسجَّل يحتاج support:ask */
  canSend: boolean;
  faqEmpty: boolean;
}) {
  const [question, setQuestion] = useState('');
  const [stage, setStage] = useState<Stage>(faqEmpty ? { kind: 'notFound', botQueryId: null, question: '', reason: 'nomatch' } : { kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ask = (q: string) => {
    const text = q.trim();
    if (text.length < 3) {
      setError('اكتب سؤالك بثلاثة محارف على الأقل.');
      return;
    }
    setQuestion(text);
    setError(null);
    start(async () => {
      const form = new FormData();
      form.set('question', text);
      const res = await askBotAction(null, form).catch(() => null);
      if (!res) return setStage({ kind: 'notFound', botQueryId: null, question: text, reason: 'error' });
      if (!res.ok || !res.data) {
        // حد المعدل أو مدخل غير صالح: الرسالة عربية من الخادم
        setError(res.message ?? null);
        return;
      }
      setStage(
        res.data.answers.length
          ? { kind: 'answered', result: res.data, question: text, feedback: 'none' }
          : { kind: 'notFound', botQueryId: res.data.botQueryId, question: text, reason: 'nomatch' },
      );
    });
  };

  const unhelpful = (s: Extract<Stage, { kind: 'answered' }>) =>
    start(async () => {
      const form = new FormData();
      form.set('botQueryId', s.result.botQueryId);
      await markUnhelpfulAction(null, form).catch(() => null);
      setStage({ kind: 'notFound', botQueryId: s.result.botQueryId, question: s.question, reason: 'unhelpful' });
    });

  return (
    <Card className="flex flex-col gap-4 p-4" aria-live="polite">
      {stage.kind !== 'sent' && !(faqEmpty && stage.kind === 'notFound') ? (
        <form
          role="search"
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <Label htmlFor="bot-q">اسأل عن المجلس والمنصة</Label>
          <div className="flex gap-2">
            <Input
              id="bot-q"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={500}
              placeholder="مثال: كيف أتابع شكواي؟"
              aria-invalid={error ? true : undefined}
            />
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
              اسأل
            </Button>
          </div>
          {pending ? <p className="text-xs text-muted-foreground">جارٍ البحث في الأسئلة المعتمدة…</p> : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
        </form>
      ) : null}

      {stage.kind === 'idle' && suggestedQuestions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">أسئلة شائعة:</p>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map((q) => (
              <Button key={q} type="button" variant="outline" size="sm" disabled={pending} onClick={() => ask(q)}>
                {q}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {stage.kind === 'answered' ? (
        <div className="flex flex-col gap-3">
          {stage.result.answers.map((a, i) => (
            <details key={a.id} open={i === 0} className="rounded-lg border p-3">
              <summary className="cursor-pointer font-medium">{a.question}</summary>
              <Markdown text={a.answerMd} className="mt-2 flex flex-col gap-2 text-sm leading-7" />
            </details>
          ))}
          {stage.feedback === 'yes' ? (
            <p className="text-sm text-success">سعدنا بإفادتك.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>هل أفادتك الإجابة؟</span>
              <Button type="button" size="sm" variant="outline" onClick={() => setStage({ ...stage, feedback: 'yes' })}>
                نعم
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => unhelpful(stage)}>
                لا
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {stage.kind === 'notFound' ? (
        <SendForm
          stage={stage}
          isAuthenticated={isAuthenticated}
          canSend={canSend}
          faqEmpty={faqEmpty}
          onSent={(message) => setStage({ kind: 'sent', message })}
        />
      ) : null}

      {stage.kind === 'sent' ? (
        <div className="flex flex-col gap-2">
          <Alert tone="success">{stage.message}</Alert>
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setStage({ kind: 'idle' })}>
            سؤال آخر
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function SendForm({
  stage,
  isAuthenticated,
  canSend,
  faqEmpty,
  onSent,
}: {
  stage: Extract<Stage, { kind: 'notFound' }>;
  isAuthenticated: boolean;
  canSend: boolean;
  faqEmpty: boolean;
  onSent: (message: string) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const lead = faqEmpty
    ? 'لا أسئلة معتمدة بعد. أرسل سؤالك لفريق المجلس مباشرة.'
    : stage.reason === 'unhelpful'
      ? 'نأسف أنها لم تفدك. أرسل سؤالك لفريق المجلس ليرد عليك.'
      : stage.reason === 'error'
        ? 'تعذّر البحث الآن. يمكنك إرسال سؤالك لفريق المجلس مباشرة.'
        : 'لم أجد إجابة معتمدة لسؤالك. أرسله لفريق المجلس ليرد عليك.';

  if (!canSend) {
    return <Alert tone="info">{lead.split('.')[0]}. إرسال الاستفسارات متاح للشباب والزوار؛ استخدم لوحة المجلس لما يخص عملك.</Alert>;
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        if (stage.botQueryId) form.set('botQueryId', stage.botQueryId);
        start(async () => {
          const res = await sendInquiryAction(null, form).catch(() => null);
          if (res?.ok) onSent(res.message ?? 'أُرسل استفسارك.');
          else setError(res?.fieldErrors?.question?.[0] ?? res?.message ?? 'تعذّر الإرسال. أعد المحاولة بعد قليل.');
        });
      }}
    >
      <p className="text-sm">{lead}</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="inq-q">استفسارك</Label>
        <Textarea id="inq-q" name="question" rows={3} maxLength={2000} defaultValue={stage.question} required />
      </div>
      {!isAuthenticated ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inq-c">وسيلة للتواصل معك (اختياري)</Label>
          <Input id="inq-c" name="contactHint" maxLength={120} placeholder="بريد أو رقم جوّال" />
          <p className="text-xs text-muted-foreground">
            لا تصلك إجابة بلا حساب إلا عبرها. لا تكتب بيانات لا تريد أن يراها فريق المجلس.
          </p>
        </div>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button type="submit" className="self-start" disabled={pending} aria-busy={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send className="flip-rtl" aria-hidden />}
        أرسل لفريق المجلس
      </Button>
    </form>
  );
}
