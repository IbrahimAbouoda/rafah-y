'use client';

import { useId, useRef, useState } from 'react';
import { applyAction } from '@/server/actions/opportunities';
import { APPLICANT_DATA_POINTS } from '@/lib/opportunities/workflow';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { ConsentDialog } from '@/components/shared/consent-dialog';
import { Textarea } from '@/components/ui/form-controls';

// AC-11: التقديم يمرّ بقرار موافقة صريح لهذا الطلب وحده (§6.8). الرفض يرسل الطلب بلا مشاركة.
// الزر الظاهر يفتح الحوار فقط؛ الإرسال الفعلي بعد القرار. بلا JavaScript يُرسل الطلب بلا مشاركة (الافتراضي الآمن).
export function ApplyForm({ opportunityId, recipient }: { opportunityId: string; recipient: string }) {
  const formId = `apply-${useId()}`;
  const share = useRef<HTMLInputElement>(null);
  const [asking, setAsking] = useState(false);

  const decide = (accepted: boolean) => {
    if (share.current) share.current.value = accepted ? 'true' : '';
    setAsking(false);
    (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit();
  };

  return (
    <>
      <ActionForm action={applyAction} id={formId} className="gap-3">
        <input type="hidden" name="opportunityId" value={opportunityId} />
        <input ref={share} type="hidden" name="shareProfile" defaultValue="" />
        <Field name="message" label="رسالة للجهة (اختيارية)" hint="لماذا تناسبك هذه الفرصة؟ لا تكتب رقم هوية ولا عنوانًا تفصيليًا.">
          <Textarea rows={3} maxLength={2000} />
        </Field>
        <SubmitButton
          onClick={(e) => {
            // مع JavaScript: القرار أولًا
            e.preventDefault();
            setAsking(true);
          }}
          className="self-start"
        >
          تقديم الطلب
        </SubmitButton>
      </ActionForm>
      <ConsentDialog
        open={asking}
        title={`مشاركة بياناتك مع ${recipient} لهذا الطلب فقط`}
        purpose="لتدرس الجهة طلبك وتتواصل معك بشأن هذه الفرصة. الموافقة لهذا الطلب وحده، ولا تغني عنها موافقتك العامة في ملفك."
        recipient={recipient}
        dataPoints={APPLICANT_DATA_POINTS}
        acceptLabel="أوافق وأرسل الطلب"
        declineLabel="أرسل دون مشاركة ملفي"
        onAccept={() => decide(true)}
        onDecline={() => decide(false)}
        // الإغلاق ليس قرار «أرسل دون مشاركة»: لا يُرسل شيء
        onDismiss={() => setAsking(false)}
      />
    </>
  );
}
