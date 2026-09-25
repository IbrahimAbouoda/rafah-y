'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { CloudOff, Loader2, Save } from 'lucide-react';
import type { DataState } from '@/lib/action';
import { deleteDraft, draftsAvailable, loadDraft, saveDraft } from '@/lib/drafts';
import type { SubmittedIdea } from '@/server/actions/ideas';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/form-controls';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surface';

// مسودة الفكرة بلا اتصال — نفس آلية §7 للشكوى (Sprint 2): IndexedDB + clientDraftId، وإرسال عند عودة الاتصال.

type Fields = Record<string, string>;
const EMPTY: Fields = { title: '', problem: '', solution: '', estimatedCost: '', areaId: '' };
type Phase = 'loading' | 'editing' | 'queued' | 'sending' | 'done';

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}
const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

export function IdeaForm({
  scope,
  submit,
  areas,
}: {
  scope: string;
  submit: (input: unknown) => Promise<DataState<SubmittedIdea>>;
  areas: { id: string; nameAr: string }[];
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [draftId, setDraftId] = useState('');
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [state, setState] = useState<DataState<SubmittedIdea>>(null);
  const [saved, setSaved] = useState(false);
  const online = useOnline();
  const sending = useRef(false);

  const send = useCallback(
    async (draft: { clientDraftId: string; fields: Fields }) => {
      if (sending.current) return;
      sending.current = true;
      setPhase('sending');
      try {
        const res = await submit({ ...draft.fields, clientDraftId: draft.clientDraftId });
        setState(res);
        if (res?.ok) {
          await deleteDraft(draft.clientDraftId).catch(() => undefined);
          setPhase('done');
        } else {
          setPhase('editing');
        }
      } catch {
        await saveDraft({ ...draft, scope, files: [], status: 'queued', updatedAt: Date.now() }).catch(() => undefined);
        setPhase('queued');
      } finally {
        sending.current = false;
      }
    },
    [scope, submit],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = draftsAvailable() ? await loadDraft(scope).catch(() => null) : null;
      if (cancelled) return;
      if (draft) {
        setDraftId(draft.clientDraftId);
        setFields({ ...EMPTY, ...(draft.fields as Fields) });
        setSaved(true);
        if (draft.status === 'queued') {
          setPhase('queued');
          if (navigator.onLine) void send({ clientDraftId: draft.clientDraftId, fields: draft.fields as Fields });
          return;
        }
      } else {
        setDraftId(crypto.randomUUID());
      }
      setPhase('editing');
    })();
    return () => {
      cancelled = true;
    };
    // تُحمَّل المسودة مرة لكل نطاق
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const latest = useRef({ phase, draft: { clientDraftId: draftId, fields } });
  useEffect(() => {
    latest.current = { phase, draft: { clientDraftId: draftId, fields } };
  });
  useEffect(() => {
    const retry = () => {
      if (latest.current.phase === 'queued' && navigator.onLine) void send(latest.current.draft);
    };
    window.addEventListener('online', retry);
    const timer = phase === 'queued' ? setInterval(retry, 15_000) : undefined;
    return () => {
      window.removeEventListener('online', retry);
      if (timer) clearInterval(timer);
    };
  }, [phase, send]);

  useEffect(() => {
    if (phase !== 'editing' || !draftId) return;
    const t = setTimeout(() => {
      saveDraft({ clientDraftId: draftId, scope, fields, files: [], status: 'editing', updatedAt: Date.now() })
        .then(() => setSaved(true))
        .catch(() => setSaved(false));
    }, 600);
    return () => clearTimeout(t);
  }, [fields, phase, draftId, scope]);

  if (phase === 'done' && state?.data) {
    return (
      <Card className="border-brand/40">
        <CardHeader>
          <CardTitle>وصلت فكرتك</CardTitle>
          <CardDescription>{state.message}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="font-mono text-lg font-semibold" dir="ltr" data-testid="idea-reference">
            {state.data.reference}
          </p>
          <Button asChild variant="outline" className="self-start">
            <Link href="/me/ideas">أفكاري</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (phase === 'loading') {
    return (
      <Card className="p-6" aria-busy aria-label="جارٍ تحميل المسودة">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          جارٍ تحميل مسودتك المحفوظة على هذا الجهاز…
        </p>
      </Card>
    );
  }

  const errors = state?.ok === false ? state.fieldErrors : undefined;
  const set = (name: string, value: string) => setFields((f) => ({ ...f, [name]: value }));
  const field = (name: string, label: string, control: React.ReactElement<Record<string, unknown>>, hint?: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      {control}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {errors?.[name] ? (
        <p id={`${name}-error`} className="text-xs text-danger">
          {errors[name]![0]}
        </p>
      ) : null}
    </div>
  );
  const common = (name: string) => ({
    id: name,
    value: fields[name],
    'aria-invalid': errors?.[name] ? true : undefined,
    'aria-describedby': errors?.[name] ? `${name}-error` : undefined,
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const draft = { clientDraftId: draftId, fields };
        if (!navigator.onLine) {
          await saveDraft({ ...draft, scope, files: [], status: 'queued', updatedAt: Date.now() }).catch(() => undefined);
          setPhase('queued');
          return;
        }
        await send(draft);
      }}
    >
      {phase === 'queued' ? (
        <Alert tone="warning">
          <span className="flex items-start gap-2">
            <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            <strong>محفوظة على جهازك — سترسَل عند عودة الاتصال.</strong>
          </span>
        </Alert>
      ) : !online ? (
        <Alert tone="info">أنت بلا اتصال. أكمل الكتابة؛ ما تكتبه محفوظ على هذا الجهاز.</Alert>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-4 pt-4 sm:pt-5">
          {field('title', 'عنوان الفكرة', <Input {...common('title')} maxLength={200} onChange={(e) => set('title', e.target.value)} />)}
          {field(
            'problem',
            'المشكلة',
            <Textarea {...common('problem')} rows={4} maxLength={5000} onChange={(e) => set('problem', e.target.value)} />,
            'ما المشكلة، ومن تمسّ؟ 20 محرفًا على الأقل.',
          )}
          {field(
            'solution',
            'الحل المقترح',
            <Textarea {...common('solution')} rows={4} maxLength={5000} onChange={(e) => set('solution', e.target.value)} />,
            'ماذا نفعل، وكيف، ومن يشارك؟',
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {field(
              'estimatedCost',
              'الكلفة التقديرية بالشيكل (اختيارية)',
              <Input {...common('estimatedCost')} inputMode="decimal" dir="ltr" onChange={(e) => set('estimatedCost', e.target.value)} />,
            )}
            {field(
              'areaId',
              'المنطقة (اختيارية)',
              <Select {...common('areaId')} onChange={(e) => set('areaId', e.target.value)}>
                <option value="">— بلا تحديد —</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nameAr}
                  </option>
                ))}
              </Select>,
            )}
          </div>
        </CardContent>
      </Card>

      {state?.ok === false && state.message ? <Alert tone="danger">{state.message}</Alert> : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          <Save className="size-3.5" aria-hidden />
          {saved ? 'المسودة محفوظة على هذا الجهاز فقط؛ مسح بيانات المتصفح يفقدها.' : 'تُحفظ مسودتك على هذا الجهاز أثناء الكتابة.'}
        </p>
        <Button type="submit" disabled={phase === 'sending' || phase === 'queued'}>
          {phase === 'sending' ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {phase === 'sending' ? 'جارٍ الإرسال…' : 'إرسال الفكرة'}
        </Button>
      </div>
    </form>
  );
}
