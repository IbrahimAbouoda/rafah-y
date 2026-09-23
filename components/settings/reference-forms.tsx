'use client';

import Link from 'next/link';
import { saveAreaAction, saveCategoryAction, saveCommitteeAction } from '@/server/actions/settings/reference';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { PermissionGate } from '@/components/shared/permission-gate';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/form-controls';

type Option = { id: string; nameAr: string };

function Actions({ editing, cancelHref }: { editing: boolean; cancelHref: string }) {
  return (
    <div className="flex gap-2">
      <SubmitButton>{editing ? 'حفظ التعديل' : 'إضافة'}</SubmitButton>
      {editing ? (
        <Button asChild variant="ghost">
          <Link href={cancelHref}>إلغاء</Link>
        </Button>
      ) : null}
    </div>
  );
}

function ActiveToggle({ checked }: { checked: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id="isActive" name="isActive" defaultChecked={checked} />
      <Label htmlFor="isActive">نشطة وتظهر في القوائم</Label>
    </div>
  );
}

export function CommitteeForm({
  committee,
}: {
  committee?: { id: string; slug: string; nameAr: string; mandate: string | null; isActive: boolean; sortOrder: number };
}) {
  return (
    <PermissionGate permission="committees:manage">
      <ActionForm key={committee?.id ?? 'new'} action={saveCommitteeAction} resetOnSuccess={!committee}>
        {committee ? <input type="hidden" name="id" value={committee.id} /> : null}
        <Field name="nameAr" label="اسم اللجنة">
          <Input defaultValue={committee?.nameAr} required />
        </Field>
        <Field name="slug" label="المعرّف في الروابط" hint="حروف إنجليزية صغيرة وشرطات، مثل legal-affairs">
          <Input defaultValue={committee?.slug} dir="ltr" required />
        </Field>
        <Field name="mandate" label="المجال (اختياري)">
          <Textarea defaultValue={committee?.mandate ?? ''} />
        </Field>
        <Field name="sortOrder" label="الترتيب">
          <Input type="number" min={0} max={1000} defaultValue={committee?.sortOrder ?? 0} dir="ltr" />
        </Field>
        <ActiveToggle checked={committee?.isActive ?? true} />
        <Actions editing={!!committee} cancelHref="/admin/settings/committees" />
      </ActionForm>
    </PermissionGate>
  );
}

export function CategoryForm({
  category,
  committees,
}: {
  category?: { id: string; nameAr: string; defaultCommitteeId: string | null; isActive: boolean; sortOrder: number };
  committees: Option[];
}) {
  return (
    <PermissionGate permission="settings:manage">
      <ActionForm key={category?.id ?? 'new'} action={saveCategoryAction} resetOnSuccess={!category}>
        {category ? <input type="hidden" name="id" value={category.id} /> : null}
        <Field name="nameAr" label="اسم التصنيف">
          <Input defaultValue={category?.nameAr} required />
        </Field>
        <Field name="defaultCommitteeId" label="اللجنة المقترحة (اختياري)" hint="تُقترح تلقائيًا عند فرز شكوى بهذا التصنيف.">
          <Select defaultValue={category?.defaultCommitteeId ?? ''}>
            <option value="">— بلا اقتراح —</option>
            {committees.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameAr}
              </option>
            ))}
          </Select>
        </Field>
        <Field name="sortOrder" label="الترتيب">
          <Input type="number" min={0} max={1000} defaultValue={category?.sortOrder ?? 0} dir="ltr" />
        </Field>
        <ActiveToggle checked={category?.isActive ?? true} />
        <Actions editing={!!category} cancelHref="/admin/settings/categories" />
      </ActionForm>
    </PermissionGate>
  );
}

export function AreaForm({
  area,
  areas,
}: {
  area?: { id: string; nameAr: string; parentId: string | null };
  areas: Option[];
}) {
  return (
    <PermissionGate permission="settings:manage">
      <ActionForm key={area?.id ?? 'new'} action={saveAreaAction} resetOnSuccess={!area}>
        {area ? <input type="hidden" name="id" value={area.id} /> : null}
        <Field name="nameAr" label="اسم المنطقة أو الحي">
          <Input defaultValue={area?.nameAr} required />
        </Field>
        <Field name="parentId" label="تتبع منطقة (اختياري)">
          <Select defaultValue={area?.parentId ?? ''}>
            <option value="">— منطقة رئيسية —</option>
            {areas
              .filter((a) => a.id !== area?.id)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nameAr}
                </option>
              ))}
          </Select>
        </Field>
        <Actions editing={!!area} cancelHref="/admin/settings/areas" />
      </ActionForm>
    </PermissionGate>
  );
}
