'use client';

import { markAttendanceAction } from '@/server/actions/activities';
import type { RegistrationStatus } from '@/lib/generated/prisma/enums';
import { formatDateTime } from '@/lib/utils';
import { ActionForm, SubmitButton } from '@/components/shared/action-form';
import { StatusBadge } from '@/components/shared/status-badge';
import { Label, Select } from '@/components/ui/form-controls';

export type AttendanceRow = {
  id: string;
  name: string;
  status: RegistrationStatus;
  markedBy: string | null;
  markedAt: Date | null;
};

// AC-13 ④: الحضور يُحفظ باسم من سجّله ووقته، ويظهر بجانب كل مشارك
export function AttendanceForm({ activityId, rows }: { activityId: string; rows: AttendanceRow[] }) {
  return (
    <ActionForm action={markAttendanceAction} className="gap-3">
      <input type="hidden" name="activityId" value={activityId} />
      <ul className="flex flex-col divide-y rounded-lg border">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <span className="flex flex-col">
              <Label htmlFor={`mark-${r.id}`}>{r.name}</Label>
              <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                <StatusBadge kind="registration" status={r.status} />
                {r.markedBy ? `سجّله ${r.markedBy} · ${formatDateTime(r.markedAt)}` : null}
              </span>
            </span>
            <Select
              id={`mark-${r.id}`}
              name={`mark:${r.id}`}
              defaultValue={r.status === 'ATTENDED' || r.status === 'NO_SHOW' ? r.status : ''}
              className="w-36"
            >
              <option value="">لم يُسجَّل</option>
              <option value="ATTENDED">حضر</option>
              <option value="NO_SHOW">لم يحضر</option>
            </Select>
          </li>
        ))}
      </ul>
      <SubmitButton className="self-start">حفظ الحضور</SubmitButton>
    </ActionForm>
  );
}
