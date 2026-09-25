'use client';

import { reviseIdeaAction } from '@/server/actions/ideas';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { Input, Textarea } from '@/components/ui/form-controls';

/** CHANGES_REQUESTED → صاحب الفكرة يعدّلها فتعود لمراجعة اللجنة (§5.2) */
export function ReviseIdeaForm({
  idea,
}: {
  idea: { id: string; title: string; problem: string; solution: string; estimatedCost: string | null };
}) {
  return (
    <ActionForm action={reviseIdeaAction}>
      <input type="hidden" name="ideaId" value={idea.id} />
      <Field name="title" label="العنوان">
        <Input defaultValue={idea.title} maxLength={200} />
      </Field>
      <Field name="problem" label="المشكلة">
        <Textarea defaultValue={idea.problem} rows={3} maxLength={5000} />
      </Field>
      <Field name="solution" label="الحل المقترح">
        <Textarea defaultValue={idea.solution} rows={3} maxLength={5000} />
      </Field>
      <Field name="estimatedCost" label="الكلفة التقديرية (اختيارية)">
        <Input defaultValue={idea.estimatedCost ?? ''} inputMode="decimal" dir="ltr" />
      </Field>
      <SubmitButton>إرسال التعديل</SubmitButton>
    </ActionForm>
  );
}
