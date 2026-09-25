'use client';

import { decideIdeaAction, mergeIdeaAction, reviewIdeaAction } from '@/server/actions/ideas';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { Input, Select, Textarea } from '@/components/ui/form-controls';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surface';

// لوحة مراجعة الفكرة. الخادم يقرّر ما يُعرض (جدول §5.2 + can() بنطاق الفكرة) ويفحص من جديد عند كل إجراء.

export type IdeaActions = {
  screen: boolean;
  toCommittee: { committees: { id: string; nameAr: string }[] } | null;
  requestChanges: boolean;
  merge: boolean;
  decide: boolean;
};

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function IdeaReviewPanel({ ideaId, actions }: { ideaId: string; actions: IdeaActions }) {
  const hidden = <input type="hidden" name="ideaId" value={ideaId} />;
  const any = actions.screen || !!actions.toCommittee || actions.requestChanges || actions.merge || actions.decide;

  return (
    <div className="flex flex-col gap-4">
      {!any ? <Alert tone="info">لا إجراء متاح لك على هذه الفكرة في حالتها الحالية.</Alert> : null}

      {actions.screen ? (
        <Section title="الفرز الأولي" description="تُنشر الفكرة للعامة ويُفتح التصويت عليها.">
          <ActionForm action={reviewIdeaAction}>
            {hidden}
            <input type="hidden" name="toStatus" value="SCREENING" />
            <SubmitButton>بدء الفرز ونشرها</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      {actions.toCommittee ? (
        <Section title="الإحالة للجنة" description="تراجعها اللجنة المختصة، ويُشعَر صاحبها.">
          <ActionForm action={reviewIdeaAction}>
            {hidden}
            <input type="hidden" name="toStatus" value="COMMITTEE_REVIEW" />
            <Field name="committeeId" label="اللجنة">
              <Select defaultValue="">
                <option value="">— اختر اللجنة —</option>
                {actions.toCommittee.committees.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameAr}
                  </option>
                ))}
              </Select>
            </Field>
            <Field name="note" label="ملاحظة داخلية (اختيارية)">
              <Textarea rows={2} maxLength={2000} />
            </Field>
            <SubmitButton>إحالة</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      {actions.requestChanges ? (
        <Section title="طلب تعديل" description="تعود الفكرة لصاحبها مع ملاحظتك، ثم ترجع للجنة بعد تعديلها.">
          <ActionForm action={reviewIdeaAction}>
            {hidden}
            <input type="hidden" name="toStatus" value="CHANGES_REQUESTED" />
            <Field name="note" label="المطلوب تعديله (يصل صاحب الفكرة)">
              <Textarea rows={3} maxLength={2000} />
            </Field>
            <SubmitButton variant="outline">طلب التعديل</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      {actions.decide ? (
        <Section title="القرار النهائي" description="اعتماد أو رفض. الرفض يؤرشف المقترح بسبب مكتوب يصل صاحبه.">
          <ActionForm action={decideIdeaAction}>
            {hidden}
            <Field name="decision" label="القرار">
              <Select defaultValue="APPROVED">
                <option value="APPROVED">اعتماد</option>
                <option value="REJECTED">رفض وأرشفة</option>
              </Select>
            </Field>
            <Field name="note" label="ملاحظة القرار" hint="إلزامية عند الرفض، وتصل صاحب الفكرة.">
              <Textarea rows={3} maxLength={2000} />
            </Field>
            <SubmitButton>حفظ القرار</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      {actions.merge ? (
        <Section title="دمج بفكرة مشابهة" description="تُغلق هذه الفكرة للتصويت، ويُحال صاحبها إلى الفكرة الأصلية.">
          <ActionForm action={mergeIdeaAction}>
            {hidden}
            <Field name="intoReference" label="رقم الفكرة الأصلية">
              <Input placeholder="RF-IDA-2026-000031" dir="ltr" />
            </Field>
            <Field name="note" label="ملاحظة (اختيارية)">
              <Textarea rows={2} maxLength={1000} />
            </Field>
            <SubmitButton variant="outline">دمج</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}
    </div>
  );
}
