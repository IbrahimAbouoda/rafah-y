'use client';

import { startTransition, useActionState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { trackComplaintAction } from '@/server/actions/complaints/track';
import { WorkflowTimeline } from '@/components/complaints/workflow-timeline';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/form-controls';
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';
import { formatDateTime } from '@/lib/utils';

// AC-02: يُعرض المسار العام والحالة واللجنة فقط — كل ما عداه لا يصل من الخادم أصلًا.
export function TrackForm({ initialReference }: { initialReference: string }) {
  const [state, action, pending] = useActionState(trackComplaintAction, null);
  const errors = state?.ok === false ? state.fieldErrors : undefined;
  const found = state?.ok ? state.data : undefined;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="pt-4 sm:pt-5">
          <form
            action={action}
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              startTransition(() => action(data));
            }}
            noValidate
            className="flex flex-col gap-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reference">الرقم المرجعي</Label>
                <Input
                  id="reference"
                  name="reference"
                  defaultValue={initialReference}
                  placeholder="RF-CMP-2026-000124"
                  dir="ltr"
                  autoComplete="off"
                  aria-invalid={errors?.reference ? true : undefined}
                  aria-describedby={errors?.reference ? 'reference-error' : undefined}
                />
                {errors?.reference ? (
                  <p id="reference-error" className="text-xs text-danger">
                    {errors.reference[0]}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="accessCode">رمز المتابعة</Label>
                <Input
                  id="accessCode"
                  name="accessCode"
                  placeholder="ABCD-EFGH"
                  dir="ltr"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-invalid={errors?.accessCode ? true : undefined}
                  aria-describedby={errors?.accessCode ? 'accessCode-error' : undefined}
                />
                {errors?.accessCode ? (
                  <p id="accessCode-error" className="text-xs text-danger">
                    {errors.accessCode[0]}
                  </p>
                ) : null}
              </div>
            </div>
            <Button type="submit" disabled={pending} aria-busy={pending} className="self-start">
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
              تتبّع
            </Button>
            {state?.ok === false && state.message ? (
              <Alert key={state.at} tone="danger">
                {state.message}
              </Alert>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {found ? (
        <Card aria-live="polite">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>
              <span className="font-mono" dir="ltr">
                {found.reference}
              </span>
            </CardTitle>
            <StatusBadge kind="complaint" status={found.status} size="md" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 text-sm">
              <p>
                <span className="text-muted-foreground">قُدّمت: </span>
                {formatDateTime(new Date(found.submittedAt))}
              </p>
              <p>
                <span className="text-muted-foreground">اللجنة المسؤولة: </span>
                {found.committee ?? 'لم تُحدَّد بعد — الشكوى في مرحلة الفرز'}
              </p>
            </div>
            <WorkflowTimeline
              currentStatus={found.status}
              events={found.events.map((e) => ({ id: e.id, toStatus: e.toStatus, note: e.note, at: new Date(e.at) }))}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
