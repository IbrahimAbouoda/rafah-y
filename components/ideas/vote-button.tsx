'use client';

import { startTransition, useActionState } from 'react';
import Link from 'next/link';
import { Loader2, ThumbsUp } from 'lucide-react';
import { voteIdeaAction } from '@/server/actions/ideas';
import { Button } from '@/components/ui/button';

// التصويت مؤشر أولوية لا بوابة (§5.2). الخادم يفحص ideas:vote والحالة والمفتاح المركّب يمنع التكرار.
export function VoteButton({
  ideaId,
  count,
  state: mode,
}: {
  ideaId: string;
  count: number;
  /** can = يصوّت · voted = صوّت من قبل · login = زائر · closed = التصويت مغلق/لا صلاحية */
  state: 'can' | 'voted' | 'login' | 'closed';
}) {
  const [result, action, pending] = useActionState(voteIdeaAction, null);
  const voted = mode === 'voted' || result?.ok;

  if (mode === 'login') {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href={`/login?next=/ideas/${ideaId}`}>
          <ThumbsUp aria-hidden />
          {count} · سجّل الدخول لتصوّت
        </Link>
      </Button>
    );
  }
  if (mode === 'closed' || voted) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground" aria-live="polite">
        <ThumbsUp className="size-4" aria-hidden />
        {/* الإجراء يعيد تحميل الصفحة، فالعدد الواصل هنا يشمل الصوت الجديد */}
        {count} صوت{voted ? ' · صوّتّ لها' : ''}
      </span>
    );
  }
  return (
    <form
      action={action}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="flex flex-col gap-1"
    >
      <input type="hidden" name="ideaId" value={ideaId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ThumbsUp aria-hidden />}
        أؤيّد · {count}
      </Button>
      {result?.ok === false ? <p className="text-xs text-danger">{result.message}</p> : null}
    </form>
  );
}
