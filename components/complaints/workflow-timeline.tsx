import { Check, CircleDot, Lock, XCircle } from 'lucide-react';
import { STAGES, STATUS_LABELS } from '@/lib/complaints/workflow';
import type { ComplaintStatus } from '@/lib/generated/prisma/enums';
import { cn, formatDateTime } from '@/lib/utils';

// WorkflowTimeline — PRD §12. mode="public" (الافتراضي في /track) يستقبل أحداث isPublic = true فقط من الاستعلام نفسه؛
// mode="internal" يعرض الملاحظات الداخلية ومن نفّذها، لمن يملك complaints:read.

export type TimelineEvent = {
  id: string;
  toStatus: ComplaintStatus;
  note: string | null;
  at: Date;
  isPublic?: boolean;
  actor?: string | null;
};

// الفروع الجانبية تُعرض في موضع المرحلة التي تنتمي إليها في المسار الرئيسي
const STAGE_OF: Partial<Record<ComplaintStatus, ComplaintStatus>> = {
  REFERRED: 'IN_PROGRESS',
  WAITING_RESPONSE: 'IN_PROGRESS',
};

export function WorkflowTimeline({
  events,
  currentStatus,
  mode = 'public',
}: {
  events: TimelineEvent[];
  currentStatus: ComplaintStatus;
  mode?: 'public' | 'internal';
}) {
  const dismissed = currentStatus === 'DISMISSED';
  const currentStage = STAGE_OF[currentStatus] ?? currentStatus;
  const currentIndex = dismissed ? STAGES.indexOf('UNDER_REVIEW') : STAGES.indexOf(currentStage);

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-wrap gap-x-1 gap-y-2" aria-label="مراحل المسار">
        {STAGES.map((stage, i) => {
          const state = i < currentIndex ? 'done' : i === currentIndex ? (dismissed ? 'dismissed' : 'current') : 'upcoming';
          const label = state === 'dismissed' ? STATUS_LABELS.DISMISSED : i === currentIndex ? STATUS_LABELS[currentStatus] : STATUS_LABELS[stage];
          return (
            <li
              key={stage}
              aria-current={state === 'current' ? 'step' : undefined}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs',
                state === 'done' && 'bg-success-soft text-success',
                state === 'current' && 'bg-brand text-brand-foreground',
                state === 'dismissed' && 'bg-danger-soft text-danger',
                state === 'upcoming' && 'bg-muted text-muted-foreground',
              )}
            >
              {state === 'done' ? <Check className="size-3" aria-hidden /> : null}
              {state === 'current' ? <CircleDot className="size-3" aria-hidden /> : null}
              {state === 'dismissed' ? <XCircle className="size-3" aria-hidden /> : null}
              <span>{label}</span>
              <span className="sr-only">
                {state === 'done' ? ' — منجزة' : state === 'current' ? ' — المرحلة الحالية' : state === 'upcoming' ? ' — قادمة' : ''}
              </span>
            </li>
          );
        })}
      </ol>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا تحديثات منشورة بعد. ستظهر هنا كل خطوة عامة في مسار الشكوى.</p>
      ) : (
        <ol className="relative flex flex-col gap-4 border-s ps-5">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span
                aria-hidden
                className={cn(
                  'absolute -start-[1.6rem] top-1.5 size-2.5 rounded-full ring-4 ring-surface',
                  e.isPublic === false ? 'bg-muted-foreground' : 'bg-brand',
                )}
              />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium">{STATUS_LABELS[e.toStatus]}</span>
                <time className="text-xs text-muted-foreground" dateTime={e.at.toISOString()}>
                  {formatDateTime(e.at)}
                </time>
                {mode === 'internal' && e.isPublic === false ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    <Lock className="size-3" aria-hidden />
                    داخلية
                  </span>
                ) : null}
              </div>
              {e.note ? <p className="mt-1 text-sm whitespace-pre-line text-foreground/90">{e.note}</p> : null}
              {mode === 'internal' && e.actor ? <p className="mt-0.5 text-xs text-muted-foreground">{e.actor}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
