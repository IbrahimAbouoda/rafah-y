'use client';

import Link from 'next/link';
import { demandVoteAction } from '@/server/actions/demand';
import { ActionForm, SubmitButton } from '@/components/shared/action-form';
import { cn } from '@/lib/utils';

// AC-12 ①: صوت واحد لكل حساب لكل استطلاع، يمكن تغييره ما دام مفتوحًا
export function DemandPollVote({
  pollId,
  options,
  myOptionId,
  threshold,
  mode,
}: {
  pollId: string;
  options: { id: string; label: string; voteCount: number }[];
  myOptionId: string | null;
  threshold: number;
  mode: 'can' | 'login' | 'closed';
}) {
  const max = Math.max(threshold, ...options.map((o) => o.voteCount), 1);
  return (
    <ul className="flex flex-col gap-2">
      {options.map((o) => {
        const mine = o.id === myOptionId;
        return (
          <li key={o.id} className={cn('flex flex-col gap-1 rounded-lg border p-3', mine && 'border-brand/60 bg-brand-soft/30')}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">
                {o.label}
                {mine ? <span className="ms-2 text-xs text-brand">صوتك</span> : null}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {o.voteCount} / {threshold}
                </span>
                {mode === 'can' && !mine ? (
                  <ActionForm action={demandVoteAction} className="gap-0">
                    <input type="hidden" name="pollId" value={pollId} />
                    <input type="hidden" name="optionId" value={o.id} />
                    <SubmitButton size="sm" variant="outline">
                      {myOptionId ? 'انقل صوتي هنا' : 'أريد هذا'}
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className={cn('h-full', o.voteCount >= threshold ? 'bg-success' : 'bg-brand')} style={{ width: `${(o.voteCount / max) * 100}%` }} />
            </div>
          </li>
        );
      })}
      {mode === 'login' ? (
        <li className="text-sm">
          <Link href="/login?next=/demand" className="text-brand hover:underline">
            سجّل الدخول لتصوّت
          </Link>
        </li>
      ) : null}
    </ul>
  );
}
