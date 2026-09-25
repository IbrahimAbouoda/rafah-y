'use client';

import { createTaskAction } from '@/server/actions/tasks';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { Input, Select, Textarea } from '@/components/ui/form-controls';

// AC-05 — المسند إليه من أعضاء اللجنة الفعليين فقط (الخادم يتحقق مرة أخرى)
export function CreateTaskForm({
  committeeId,
  members,
  complaint,
}: {
  committeeId: string;
  members: { id: string; fullName: string; roles: string[] }[];
  /** من شكوى: العنوان معبّأ، والمهمة مرتبطة بها */
  complaint?: { id: string; title: string };
}) {
  return (
    <ActionForm action={createTaskAction} resetOnSuccess>
      <input type="hidden" name="committeeId" value={committeeId} />
      {complaint ? <input type="hidden" name="complaintId" value={complaint.id} /> : null}
      <Field name="title" label="عنوان المهمة">
        <Input maxLength={200} defaultValue={complaint ? `متابعة: ${complaint.title}` : undefined} />
      </Field>
      <Field name="description" label="التفاصيل (اختيارية)">
        <Textarea rows={2} maxLength={2000} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field name="assigneeId" label="المسند إليه">
          <Select defaultValue="">
            <option value="">— اختر عضوًا —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName} ({m.roles.join('، ')})
              </option>
            ))}
          </Select>
        </Field>
        <Field name="priority" label="الأولوية">
          <Select defaultValue="MEDIUM">
            <option value="LOW">منخفضة</option>
            <option value="MEDIUM">متوسطة</option>
            <option value="HIGH">عالية</option>
            <option value="URGENT">عاجلة</option>
          </Select>
        </Field>
        <Field name="dueAt" label="آخر موعد (اختياري)">
          <Input type="date" />
        </Field>
      </div>
      <SubmitButton>إنشاء المهمة وإسنادها</SubmitButton>
    </ActionForm>
  );
}
