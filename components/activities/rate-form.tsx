'use client';

import { rateActivityAction } from '@/server/actions/activities';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { Select, Textarea } from '@/components/ui/form-controls';

// AC-13: التقييم من الحاضر فقط — الخادم يتحقق من الحضور، والقاعدة تضمن 1–5
export function RateForm({ activityId, rating, feedback }: { activityId: string; rating: number | null; feedback: string | null }) {
  return (
    <ActionForm action={rateActivityAction} className="gap-3">
      <input type="hidden" name="activityId" value={activityId} />
      <Field name="rating" label="تقييمك للنشاط">
        <Select defaultValue={rating ? String(rating) : ''}>
          <option value="" disabled>
            اختر من 1 إلى 5
          </option>
          <option value="5">5 — ممتاز</option>
          <option value="4">4 — جيد جدًا</option>
          <option value="3">3 — جيد</option>
          <option value="2">2 — مقبول</option>
          <option value="1">1 — ضعيف</option>
        </Select>
      </Field>
      <Field name="feedback" label="ملاحظاتك (اختيارية)" hint="ما الذي أعجبك؟ وما الذي يُحسَّن في المرة القادمة؟">
        <Textarea rows={2} maxLength={1000} defaultValue={feedback ?? ''} />
      </Field>
      <SubmitButton className="self-start">{rating ? 'تحديث التقييم' : 'إرسال التقييم'}</SubmitButton>
    </ActionForm>
  );
}
