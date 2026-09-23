'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CloudOff, Loader2, Paperclip, Save, Trash2 } from 'lucide-react';
import type { DataState } from '@/lib/action';
import type { SubmitResult } from '@/lib/complaints/create';
import { deleteDraft, draftsAvailable, loadDraft, saveDraft, type ComplaintDraft, type DraftFile } from '@/lib/drafts';
import { formatBytes } from '@/lib/files';
import { uploadComplaintFiles, type UploadOutcome } from '@/lib/upload-client';
import { MAX_FILES_PER_RECORD, MAX_UPLOAD_BYTES, UPLOAD_MIME_TYPES } from '@/lib/validation/complaints';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/form-controls';
import { Alert, Card, CardContent } from '@/components/ui/surface';
import { ReferenceCard } from './reference-card';

// نموذج الشكوى — AC-01 · AC-17. يعمل للحساب (/me/complaints/new) وللزائر (/complaints/public-new).
// كل تغيير يُحفظ في IndexedDB بـ clientDraftId؛ الإرسال بلا اتصال يضع المسودة في الطابور وتُرسل عند عودته.

type Option = { id: string; nameAr: string };
type Fields = Record<string, string | boolean>;

const EMPTY: Fields = {
  title: '',
  body: '',
  categoryId: '',
  areaId: '',
  isAnonymous: false,
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  preferredChannel: '',
};

type Phase = 'loading' | 'editing' | 'queued' | 'sending' | 'uploading' | 'done';

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** حالة الاتصال من المتصفح — على الخادم تُفترض متصلة */
const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

function FieldError({ name, errors }: { name: string; errors?: Record<string, string[] | undefined> }) {
  const e = errors?.[name]?.[0];
  return e ? (
    <p id={`${name}-error`} className="text-xs text-danger">
      {e}
    </p>
  ) : null;
}

export function ComplaintForm({
  scope,
  submit,
  categories,
  areas,
  trackUrl,
  allowAnonymousToggle,
  privacyNotice,
}: {
  /** نطاق المسودة على هذا الجهاز: "public" أو "account:<userId>" */
  scope: string;
  submit: (input: unknown) => Promise<DataState<SubmitResult>>;
  categories: Option[];
  areas: Option[];
  trackUrl: string;
  /** الحساب يختار إخفاء هويته؛ الزائر يختار ترك بيانات تواصل أو لا */
  allowAnonymousToggle: boolean;
  privacyNotice: React.ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [draftId, setDraftId] = useState<string>('');
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [state, setState] = useState<DataState<SubmitResult>>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [uploads, setUploads] = useState<UploadOutcome[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const online = useOnline();
  const sending = useRef(false);

  const persist = useCallback(
    async (next: Partial<ComplaintDraft>) => {
      if (!draftId) return;
      try {
        await saveDraft({ clientDraftId: draftId, scope, fields, files, status: 'editing', updatedAt: Date.now(), ...next });
        setSavedAt(Date.now());
      } catch {
        setSavedAt(null);
      }
    },
    [draftId, scope, fields, files],
  );

  const send = useCallback(
    async (draft: { clientDraftId: string; fields: Fields; files: DraftFile[] }) => {
      if (sending.current) return;
      sending.current = true;
      setPhase('sending');
      setState(null);
      try {
        const res = await submit({ ...draft.fields, clientDraftId: draft.clientDraftId });
        setState(res);
        if (!res?.ok || !res.data) {
          setPhase('editing');
          await saveDraft({ ...draft, scope, status: 'editing', updatedAt: Date.now() }).catch(() => undefined);
          return;
        }
        setResult(res.data);
        if (draft.files.length > 0) {
          setPhase('uploading');
          await uploadComplaintFiles(res.data.reference, res.data.accessCode, draft.files, (o) => setUploads((u) => [...u, o]));
        }
        await deleteDraft(draft.clientDraftId).catch(() => undefined);
        setPhase('done');
      } catch {
        // الشبكة سقطت أثناء الإرسال: المسودة تبقى في الطابور، والإعادة لن تنتج شكوى ثانية (clientDraftId)
        await saveDraft({ ...draft, scope, status: 'queued', updatedAt: Date.now() }).catch(() => undefined);
        setPhase('queued');
      } finally {
        sending.current = false;
      }
    },
    [scope, submit],
  );

  // تحميل المسودة المحفوظة، وإرسال ما كان في الطابور إن عاد الاتصال (AC-17 ④)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = draftsAvailable() ? await loadDraft(scope).catch(() => null) : null;
      if (cancelled) return;
      if (draft) {
        setDraftId(draft.clientDraftId);
        setFields({ ...EMPTY, ...draft.fields });
        setFiles(draft.files ?? []);
        setSavedAt(draft.updatedAt);
        if (draft.status === 'queued') {
          setPhase('queued');
          if (navigator.onLine) void send(draft);
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
    // المسودة تُحمَّل مرة واحدة لكل نطاق
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // عودة الاتصال ترسل المسودة المنتظرة تلقائيًا (AC-17): عند حدث online، ومحاولة كل 15 ثانية ما دامت منتظرة
  // (قد يعود المتصفح «متصلًا» والشبكة متذبذبة). لا إعادة فورية متتالية: كل محاولة تنتظر حدثًا أو مهلة.
  const latest = useRef({ phase, draft: { clientDraftId: draftId, fields, files } });
  useEffect(() => {
    latest.current = { phase, draft: { clientDraftId: draftId, fields, files } };
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

  // حفظ تلقائي بعد توقف الكتابة
  useEffect(() => {
    if (phase !== 'editing' || !draftId) return;
    const t = setTimeout(() => void persist({}), 600);
    return () => clearTimeout(t);
  }, [fields, files, phase, draftId, persist]);

  const set = (name: string, value: string | boolean) => setFields((f) => ({ ...f, [name]: value }));

  function addFiles(list: FileList | null) {
    setFileError(null);
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_FILES_PER_RECORD) {
        setFileError(`الحد الأقصى ${MAX_FILES_PER_RECORD} ملفات.`);
        break;
      }
      if (!(UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) {
        setFileError(`«${file.name}»: النوع غير مسموح. المسموح صور JPG أو PNG أو WEBP، أو PDF.`);
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setFileError(`«${file.name}»: أكبر من 5 ميجابايت.`);
        continue;
      }
      next.push({ id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, blob: file });
    }
    setFiles(next);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const draft = { clientDraftId: draftId, fields, files };
    if (!navigator.onLine) {
      await saveDraft({ ...draft, scope, status: 'queued', updatedAt: Date.now() }).catch(() => undefined);
      setPhase('queued');
      return;
    }
    await send(draft);
  }

  async function discard() {
    await deleteDraft(draftId).catch(() => undefined);
    setDraftId(crypto.randomUUID());
    setFields(EMPTY);
    setFiles([]);
    setState(null);
    setSavedAt(null);
    setPhase('editing');
  }

  if (phase === 'done' && result) {
    return (
      <ReferenceCard reference={result.reference} accessCode={result.accessCode} trackUrl={trackUrl} message={state?.message}>
        {uploads.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm">
            {uploads.map((u, i) => (
              <li key={i} className={u.ok ? 'text-success' : 'text-danger'}>
                {u.name}: {u.message}
              </li>
            ))}
          </ul>
        ) : null}
      </ReferenceCard>
    );
  }

  if (phase === 'loading') {
    return (
      <Card className="p-6" aria-busy aria-label="جارٍ تحميل المسودة">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          جارٍ تحميل مسودتك المحفوظة على هذا الجهاز…
        </div>
      </Card>
    );
  }

  const errors = state?.ok === false ? state.fieldErrors : undefined;
  const anonymous = fields.isAnonymous === true;
  const busy = phase === 'sending' || phase === 'uploading';
  const invalid = (name: string) => (errors?.[name] ? true : undefined);
  const described = (name: string, hint?: boolean) =>
    [errors?.[name] ? `${name}-error` : null, hint ? `${name}-hint` : null].filter(Boolean).join(' ') || undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {phase === 'queued' ? (
        <Alert tone="warning">
          <span className="flex items-start gap-2">
            <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong>محفوظة على جهازك — سترسَل عند عودة الاتصال.</strong> اترك هذه الصفحة مفتوحة أو عد إليها لاحقًا؛ لا
              رقم مرجعي قبل الإرسال الفعلي.
            </span>
          </span>
        </Alert>
      ) : !online ? (
        <Alert tone="info">أنت بلا اتصال الآن. أكمل الكتابة؛ ما تكتبه محفوظ على هذا الجهاز.</Alert>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-4 pt-4 sm:pt-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">عنوان الشكوى</Label>
            <Input
              id="title"
              value={String(fields.title)}
              onChange={(e) => set('title', e.target.value)}
              maxLength={200}
              aria-invalid={invalid('title')}
              aria-describedby={described('title')}
              placeholder="مثال: انقطاع المياه عن حي الشابورة منذ أسبوع"
            />
            <FieldError name="title" errors={errors} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="categoryId">التصنيف</Label>
              <Select
                id="categoryId"
                value={String(fields.categoryId)}
                onChange={(e) => set('categoryId', e.target.value)}
                aria-invalid={invalid('categoryId')}
                aria-describedby={described('categoryId')}
              >
                <option value="">— اختر —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameAr}
                  </option>
                ))}
              </Select>
              <FieldError name="categoryId" errors={errors} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="areaId">المنطقة (اختياري)</Label>
              <Select
                id="areaId"
                value={String(fields.areaId)}
                onChange={(e) => set('areaId', e.target.value)}
                aria-invalid={invalid('areaId')}
                aria-describedby={described('areaId')}
              >
                <option value="">— بلا تحديد —</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nameAr}
                  </option>
                ))}
              </Select>
              <FieldError name="areaId" errors={errors} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="body">التفاصيل</Label>
            <Textarea
              id="body"
              value={String(fields.body)}
              onChange={(e) => set('body', e.target.value)}
              maxLength={5000}
              rows={7}
              aria-invalid={invalid('body')}
              aria-describedby={described('body', true)}
            />
            <p id="body-hint" className="text-xs text-muted-foreground">
              ماذا حدث، وأين، ومنذ متى، ومن المتأثر. 20 محرفًا على الأقل · {String(fields.body).length}/5000
            </p>
            <FieldError name="body" errors={errors} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="files">مرفقات (اختياري)</Label>
            <label
              htmlFor="files"
              className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground hover:bg-muted"
            >
              <Paperclip className="size-4" aria-hidden />
              اختر صورًا أو ملف PDF — حتى {MAX_FILES_PER_RECORD} ملفات، 5 ميجابايت لكل ملف
            </label>
            <input
              id="files"
              type="file"
              multiple
              accept={UPLOAD_MIME_TYPES.join(',')}
              className="sr-only"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            {fileError ? <p className="text-xs text-danger">{fileError}</p> : null}
            {files.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا مرفقات. تُرفع بعد وصول الشكوى وتُفحص أمنيًا قبل أن يراها أحد.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-1.5 text-sm">
                    <span className="truncate">{f.name}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      {formatBytes(f.size)}
                      <button
                        type="button"
                        onClick={() => setFiles((all) => all.filter((x) => x.id !== f.id))}
                        aria-label={`إزالة ${f.name}`}
                        className="rounded p-1 hover:bg-background"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-4 sm:pt-5">
          <div className="flex items-start gap-2">
            <Checkbox
              id="isAnonymous"
              checked={anonymous}
              onChange={(e) => {
                const on = e.target.checked;
                setFields((f) =>
                  on ? { ...f, isAnonymous: true, contactName: '', contactPhone: '', contactEmail: '', preferredChannel: '' } : { ...f, isAnonymous: false },
                );
              }}
              aria-invalid={invalid('isAnonymous')}
              aria-describedby={described('isAnonymous', true)}
              className="mt-1"
            />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="isAnonymous">{allowAnonymousToggle ? 'أخفِ هويتي' : 'شكوى مجهولة بلا بيانات تواصل'}</Label>
              <p id="isAnonymous-hint" className="text-xs text-muted-foreground">
                {allowAnonymousToggle
                  ? 'لن تُربط الشكوى بحسابك إطلاقًا، ولن تظهر في «شكاواي». تتابعها بالرقم والرمز فقط.'
                  : 'لا نعرف من أنت، ولا نستطيع التواصل معك. تتابعها بالرقم والرمز فقط.'}
              </p>
              <FieldError name="isAnonymous" errors={errors} />
            </div>
          </div>

          {!anonymous ? (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-sm font-medium">بيانات التواصل (اختيارية، تُحفظ مشفّرة)</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="contactName">الاسم</Label>
                  <Input
                    id="contactName"
                    value={String(fields.contactName)}
                    onChange={(e) => set('contactName', e.target.value)}
                    autoComplete="name"
                    aria-invalid={invalid('contactName')}
                    aria-describedby={described('contactName')}
                  />
                  <FieldError name="contactName" errors={errors} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="contactPhone">رقم الجوّال</Label>
                  <Input
                    id="contactPhone"
                    value={String(fields.contactPhone)}
                    onChange={(e) => set('contactPhone', e.target.value)}
                    inputMode="tel"
                    autoComplete="tel"
                    dir="ltr"
                    aria-invalid={invalid('contactPhone')}
                    aria-describedby={described('contactPhone')}
                  />
                  <FieldError name="contactPhone" errors={errors} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="contactEmail">البريد</Label>
                  <Input
                    id="contactEmail"
                    value={String(fields.contactEmail)}
                    onChange={(e) => set('contactEmail', e.target.value)}
                    inputMode="email"
                    autoComplete="email"
                    dir="ltr"
                    aria-invalid={invalid('contactEmail')}
                    aria-describedby={described('contactEmail')}
                  />
                  <FieldError name="contactEmail" errors={errors} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5 sm:max-w-xs">
                <Label htmlFor="preferredChannel">كيف نتواصل معك؟</Label>
                <Select
                  id="preferredChannel"
                  value={String(fields.preferredChannel)}
                  onChange={(e) => set('preferredChannel', e.target.value)}
                  aria-invalid={invalid('preferredChannel')}
                >
                  <option value="">— لا تفضيل —</option>
                  <option value="PHONE">اتصال هاتفي</option>
                  <option value="WHATSAPP">واتساب</option>
                  <option value="EMAIL">البريد</option>
                </Select>
                <FieldError name="preferredChannel" errors={errors} />
              </div>
            </fieldset>
          ) : null}

          <div className="rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">{privacyNotice}</div>
        </CardContent>
      </Card>

      {state?.ok === false && state.message ? <Alert tone="danger">{state.message}</Alert> : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          <Save className="size-3.5" aria-hidden />
          {savedAt
            ? 'المسودة محفوظة على هذا الجهاز فقط؛ مسح بيانات المتصفح يفقدها.'
            : 'تُحفظ مسودتك على هذا الجهاز أثناء الكتابة.'}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={discard} disabled={busy}>
            مسح المسودة
          </Button>
          <Button type="submit" disabled={busy || phase === 'queued'} aria-busy={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {phase === 'uploading' ? 'جارٍ رفع المرفقات…' : phase === 'sending' ? 'جارٍ الإرسال…' : 'إرسال الشكوى'}
          </Button>
        </div>
      </div>
    </form>
  );
}
