'use client';

import { useState } from 'react';
import { assignRoleAction, revokeRoleAction } from '@/server/actions/settings/roles';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { PermissionGate } from '@/components/shared/permission-gate';
import { Input, Select } from '@/components/ui/form-controls';

type RoleOption = { id: string; nameAr: string; requiresCommittee: boolean; isTermBound: boolean };

export function AssignRoleForm({
  userId,
  roles,
  committees,
}: {
  userId: string;
  roles: RoleOption[];
  committees: { id: string; nameAr: string }[];
}) {
  const [roleId, setRoleId] = useState('');
  const role = roles.find((r) => r.id === roleId);

  return (
    <PermissionGate permission="users:manage_roles">
      <ActionForm action={assignRoleAction} resetOnSuccess>
        <input type="hidden" name="userId" value={userId} />
        <Field name="roleId" label="الدور">
          <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
            <option value="">— اختر الدور —</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nameAr}
              </option>
            ))}
          </Select>
        </Field>
        {role?.requiresCommittee ? (
          <Field name="committeeId" label="اللجنة">
            <Select defaultValue="" required>
              <option value="">— اختر اللجنة —</option>
              {committees.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameAr}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field name="title" label="المسمّى (اختياري)" hint="مثل: مقرر اللجنة">
          <Input />
        </Field>
        <Field
          name="endsAt"
          label="ينتهي في (اختياري)"
          hint="للإنابة المؤقتة: يُسحب الدور تلقائيًا في هذا التاريخ. اتركه فارغًا لدور دائم."
        >
          <Input type="date" dir="ltr" />
        </Field>
        {role?.isTermBound ? <p className="text-xs text-muted-foreground">يرتبط هذا الدور بالدورة الحالية ويتوقف بانتهائها.</p> : null}
        <SubmitButton>تعيين</SubmitButton>
      </ActionForm>
    </PermissionGate>
  );
}

export function RevokeButton({ assignmentId, roleName }: { assignmentId: string; roleName: string }) {
  return (
    <PermissionGate permission="users:manage_roles">
      <ActionForm action={revokeRoleAction} className="shrink-0 items-end gap-2">
        <input type="hidden" name="assignmentId" value={assignmentId} />
        <SubmitButton
          variant="outline"
          size="sm"
          onClick={(e) => {
            if (!window.confirm(`سحب دور «${roleName}»؟ يفقد المستخدم صلاحياته من الطلب التالي.`)) e.preventDefault();
          }}
        >
          سحب
        </SubmitButton>
      </ActionForm>
    </PermissionGate>
  );
}
