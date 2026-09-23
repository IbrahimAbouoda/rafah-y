'use client';

import { useState } from 'react';
import type { ActionState } from '@/lib/action';
import { STATUS_LABELS } from '@/lib/complaints/workflow';
import type { ComplaintStatus } from '@/lib/generated/prisma/enums';
import {
  assignToCommitteeAction,
  closeComplaintAction,
  dismissComplaintAction,
  openForTriageAction,
  referComplaintAction,
  updateStatusAction,
} from '@/server/actions/complaints/workflow';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/form-controls';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surface';

// لوحة إجراءات الشكوى. الخادم يقرّر ما يُعرض هنا (can() بنطاق الشكوى + جدول الانتقالات)،
// ثم يفحص كل إجراء من جديد عند الاستدعاء — إخفاء الزر ليس حماية.

export type ComplaintActions = {
  openForTriage: boolean;
  assign: { committees: { id: string; nameAr: string }[]; suggestedId: string | null } | null;
  dismiss: boolean;
  updateStatus: ComplaintStatus[];
  refer: boolean;
  close: boolean;
  /** WAITING_RESPONSE: حقل رد الجهة الخارجية عند الانتقال */
  awaitingResponse: boolean;
};

const REFERRAL_TARGETS: [string, string][] = [
  ['MUNICIPALITY', 'البلدية'],
  ['ORGANIZATION', 'مؤسسة'],
  ['GOVERNMENT', 'جهة حكومية'],
  ['LEGAL', 'جهة قانونية'],
  ['OTHER', 'أخرى'],
];

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

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

export function ComplaintActionsPanel({ complaintId, actions }: { complaintId: string; actions: ComplaintActions }) {
  const hidden = <input type="hidden" name="complaintId" value={complaintId} />;
  // نجاح الإجراء يغيّر الحالة فيختفي نموذجه نفسه (فتح الفرز، الإغلاق…)؛ لذا تُعرض النتيجة هنا، في اللوحة الباقية
  const [done, setDone] = useState<ActionState>(null);
  const report =
    (action: Action): Action =>
    async (prev, form) => {
      const result = await action(prev, form);
      if (result?.ok) setDone(result);
      return result;
    };
  const any =
    actions.openForTriage || !!actions.assign || actions.dismiss || actions.close || actions.refer || actions.updateStatus.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {done?.message ? (
        <Alert key={done.at} tone="success">
          {done.message}
        </Alert>
      ) : null}
      {!any ? <Alert tone="info">صلاحية عرض فقط: لا إجراء متاح لك على هذه الشكوى في حالتها الحالية.</Alert> : null}
      {actions.openForTriage ? (
        <Section title="الفرز" description="افتح الشكوى للفرز ليعرف مقدّمها أنها قيد المراجعة، ثم اختر اللجنة.">
          <ActionForm action={report(openForTriageAction)} hideSuccess resetOnSuccess>
            {hidden}
            <SubmitButton>فتح للفرز</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      {actions.assign ? (
        <Section title="التحويل إلى لجنة" description="يصل رئيس اللجنة إشعار فوري، ويرى مقدّم الشكوى اسم اللجنة في صفحة التتبّع.">
          <ActionForm action={report(assignToCommitteeAction)} hideSuccess resetOnSuccess>
            {hidden}
            <Field name="committeeId" label="اللجنة" hint={actions.assign.suggestedId ? 'المقترحة من التصنيف محددة مسبقًا.' : undefined}>
              <Select defaultValue={actions.assign.suggestedId ?? ''}>
                <option value="">— اختر اللجنة —</option>
                {actions.assign.committees.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameAr}
                  </option>
                ))}
              </Select>
            </Field>
            <Field name="note" label="تعليق التحويل (داخلي)" hint="يراه أعضاء اللجنة فقط، ولا يظهر لمقدّم الشكوى.">
              <Textarea rows={3} maxLength={1000} />
            </Field>
            <SubmitButton>تحويل</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      {actions.updateStatus.length > 0 ? (
        <Section title="تحديث الحالة" description="انقل الشكوى إلى خطوتها التالية واكتب ملاحظة. ملاحظة الحل تظهر لمقدّم الشكوى دائمًا.">
          <ActionForm action={report(updateStatusAction)} hideSuccess resetOnSuccess>
            {hidden}
            <Field name="toStatus" label="الحالة التالية">
              <Select defaultValue={actions.updateStatus[0]}>
                {actions.updateStatus.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field name="note" label="ملاحظة">
              <Textarea rows={3} maxLength={2000} />
            </Field>
            {actions.awaitingResponse ? (
              <Field name="response" label="رد الجهة الخارجية (عند وصوله)" hint="يُحفظ على سجل الإحالة، داخليًا.">
                <Textarea rows={2} maxLength={2000} />
              </Field>
            ) : null}
            <div className="flex items-center gap-2">
              {/* داخلية افتراضيًا: النشر قرار صريح، فلا تتسرّب ملاحظة داخلية بالسهو */}
              <Checkbox id="isPublic" name="isPublic" />
              <Label htmlFor="isPublic">ملاحظة عامة يراها مقدّم الشكوى في صفحة التتبّع</Label>
            </div>
            <SubmitButton>حفظ الحالة</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      {actions.refer ? (
        <Section title="إحالة لجهة خارجية" description="اسم الجهة وتفاصيل الإحالة داخلية؛ يرى مقدّم الشكوى أنها أُحيلت فقط.">
          <ActionForm action={report(referComplaintAction)} hideSuccess resetOnSuccess>
            {hidden}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field name="target" label="نوع الجهة">
                <Select defaultValue="MUNICIPALITY">
                  {REFERRAL_TARGETS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field name="targetName" label="اسم الجهة">
                <Input maxLength={200} />
              </Field>
            </div>
            <Field name="followUpAt" label="موعد المتابعة (اختياري)" hint="تاريخ في المستقبل.">
              <Input type="date" />
            </Field>
            <Field name="note" label="ملاحظة داخلية">
              <Textarea rows={2} maxLength={2000} />
            </Field>
            <SubmitButton variant="outline">إحالة</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      {actions.close ? (
        <Section title="الإغلاق" description="بعد إبلاغ مقدّم الشكوى بالحل.">
          <ActionForm action={report(closeComplaintAction)} hideSuccess resetOnSuccess>
            {hidden}
            <Field name="note" label="كلمة ختامية (اختيارية، عامة)">
              <Textarea rows={2} maxLength={1000} />
            </Field>
            <SubmitButton>إغلاق الشكوى</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      {actions.dismiss ? (
        <Section title="الاستبعاد" description="للشكوى المكررة أو خارج اختصاص المجلس. السبب إلزامي ويصل مقدّم الشكوى.">
          <ActionForm action={report(dismissComplaintAction)} hideSuccess resetOnSuccess>
            {hidden}
            <Field name="reason" label="سبب الاستبعاد">
              <Textarea rows={3} maxLength={1000} />
            </Field>
            <SubmitButton variant="destructive">استبعاد</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}
    </div>
  );
}
