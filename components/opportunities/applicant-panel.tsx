'use client';

import { startTransition, useActionState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { setApplicationStatusAction, viewApplicantAction } from '@/server/actions/opportunities';
import { exportApplicantsAction } from '@/server/actions/opportunities/export';
import { DownloadButton } from '@/components/shared/download-button';
import type { ApplicationStatus } from '@/lib/generated/prisma/enums';
import { APPLICATION_STATUS_LABELS, EDUCATION_LABELS, SKILL_LEVEL_LABELS } from '@/lib/opportunities/workflow';
import { formatDate } from '@/lib/utils';
import { ActionButtons } from '@/components/shared/action-buttons';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/surface';

export type ApplicantItem = {
  id: string;
  number: number;
  status: ApplicationStatus;
  shareProfile: boolean;
  createdAt: Date;
  nextStatuses: ApplicationStatus[];
};

// D31: القائمة بلا بيانات شخصية؛ «عرض بيانات المتقدّم» يطلبها صراحةً ويُسجَّل في التدقيق (AC-11 ③).
// من لم يوافق يظهر طلبه بلا أي بيانات (AC-11 ②) ولا زر عرض له.
/** opportunityId ⇒ زر تصدير القائمة نفسها (D31: بلا بيانات شخصية) */
export function ApplicantPanel({ applicants, opportunityId }: { applicants: ApplicantItem[]; opportunityId?: string }) {
  if (applicants.length === 0) {
    return <p className="text-sm text-muted-foreground">لا متقدّمين بعد. تظهر الطلبات هنا فور وصولها.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {opportunityId ? (
        <div className="flex justify-end">
          <DownloadButton action={exportApplicantsAction} fields={{ opportunityId }} label="تصدير القائمة (XLSX)" />
        </div>
      ) : null}
      <ul className="flex flex-col divide-y rounded-lg border">
        {applicants.map((a) => (
          <li key={a.id} className="flex flex-col gap-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex flex-col">
                <span className="font-medium">متقدّم رقم {a.number}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(a.createdAt)} · {a.shareProfile ? 'وافق على مشاركة ملفه' : 'لم يوافق على مشاركة ملفه'}
                </span>
              </span>
              <StatusBadge kind="application" status={a.status} />
            </div>
            {a.shareProfile && a.status !== 'WITHDRAWN' ? (
              <>
                <ApplicantReveal applicationId={a.id} />
                {a.nextStatuses.length > 0 ? (
                  <ActionButtons
                    items={a.nextStatuses.map((to) => ({
                      action: setApplicationStatusAction,
                      fields: { applicationId: a.id, toStatus: to },
                      label: `نقل إلى «${APPLICATION_STATUS_LABELS[to]}»`,
                      variant: to === 'ACCEPTED' ? 'default' : 'outline',
                    }))}
                  />
                ) : null}
              </>
            ) : !a.shareProfile ? (
              <p className="text-xs text-muted-foreground">لا تُعرض أي بيانات لمن لم يوافق، ولا يُدار طلبه من المؤسسة.</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ApplicantReveal({ applicationId }: { applicationId: string }) {
  const [state, action, pending] = useActionState(viewApplicantAction, null);
  const v = state?.ok ? state.data : undefined;

  if (v) {
    const rows: [string, string | null][] = [
      ['الاسم', v.fullName],
      ['البريد', v.email],
      ['الجوّال', v.phone],
      ['سنة الميلاد', v.birthYear ? String(v.birthYear) : null],
      ['المنطقة', v.area],
      ['التعليم', v.educationLevel ? EDUCATION_LABELS[v.educationLevel] : null],
      ['اللغات', v.languages.join('، ') || null],
      ['الاهتمامات', v.interests.join('، ') || null],
      ['يبحث عن عمل', v.jobSeeking ? 'نعم' : 'لا'],
      ['المهارات', v.skills.map((s) => `${s.name} (${SKILL_LEVEL_LABELS[s.level]})`).join('، ') || null],
      ['رسالته', v.message],
    ];
    return (
      <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {rows
            .filter(([, value]) => value)
            .map(([k, value]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd dir="auto" className="break-words whitespace-pre-line">
                  {value}
                </dd>
              </div>
            ))}
        </dl>
        <p className="text-xs text-muted-foreground">{state?.message}</p>
      </div>
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
      <input type="hidden" name="applicationId" value={applicationId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="self-start">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Eye aria-hidden />}
        عرض بيانات المتقدّم
      </Button>
      <p className="text-xs text-muted-foreground">كل عرض يُسجَّل باسمك في سجل التدقيق.</p>
      {state?.ok === false ? <Alert tone="danger">{state.message}</Alert> : null}
    </form>
  );
}
