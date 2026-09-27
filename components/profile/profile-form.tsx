'use client';

import { useId, useRef, useState } from 'react';
import { setConsentAction, updateProfileAction } from '@/server/actions/profile';
import type { EducationLevel, SkillLevel } from '@/lib/generated/prisma/enums';
import { EDUCATION_LABELS, SKILL_LEVEL_LABELS } from '@/lib/opportunities/workflow';
import { formatDateTime } from '@/lib/utils';
import { ActionForm, Field, SubmitButton } from '@/components/shared/action-form';
import { ConsentDialog } from '@/components/shared/consent-dialog';
import { Checkbox, Input, Label, Select } from '@/components/ui/form-controls';

type Profile = {
  birthYear: number | null;
  areaId: string | null;
  educationLevel: EducationLevel | null;
  languages: string[];
  interests: string[];
  jobSeeking: boolean;
};

// /me/profile — بلا تاريخ ميلاد كامل ولا رقم هوية ولا عنوان تفصيلي (§4.4)
export function ProfileForm({
  profile,
  areas,
  skills,
  mySkills,
}: {
  profile: Profile | null;
  areas: { id: string; name: string }[];
  skills: { id: string; name: string; category: string | null }[];
  mySkills: Record<string, SkillLevel>;
}) {
  const groups = new Map<string, typeof skills>();
  for (const s of skills) {
    const key = s.category ?? 'أخرى';
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return (
    <ActionForm action={updateProfileAction} className="gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field name="birthYear" label="سنة الميلاد" hint="السنة فقط، لا التاريخ الكامل.">
          <Input inputMode="numeric" dir="ltr" maxLength={4} defaultValue={profile?.birthYear ?? ''} />
        </Field>
        <Field name="areaId" label="المنطقة">
          <Select defaultValue={profile?.areaId ?? ''}>
            <option value="">لا أحدّد</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field name="educationLevel" label="المستوى التعليمي">
          <Select defaultValue={profile?.educationLevel ?? ''}>
            <option value="">لا أحدّد</option>
            {Object.entries(EDUCATION_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field name="languages" label="اللغات" hint="افصل بينها بفاصلة، مثل: العربية، الإنجليزية">
        <Input defaultValue={profile?.languages.join('، ') ?? ''} />
      </Field>
      <Field name="interests" label="الاهتمامات" hint="افصل بينها بفاصلة، مثل: التصوير، العمل التطوعي">
        <Input defaultValue={profile?.interests.join('، ') ?? ''} />
      </Field>
      <div className="flex items-center gap-2">
        <Checkbox id="jobSeeking" name="jobSeeking" defaultChecked={profile?.jobSeeking ?? false} />
        <Label htmlFor="jobSeeking" className="font-normal">
          أبحث عن عمل
        </Label>
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">مهاراتي ومستواي في كل منها</legend>
        {skills.length === 0 ? (
          <p className="text-sm text-muted-foreground">لم تُضف قائمة المهارات بعد. تواصل مع أمانة السر.</p>
        ) : (
          [...groups].map(([category, list]) => (
            <div key={category} className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">{category}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {list.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5">
                    <Label htmlFor={`skill-${s.id}`} className="font-normal">
                      {s.name}
                    </Label>
                    <Select id={`skill-${s.id}`} name={`skill:${s.id}`} defaultValue={mySkills[s.id] ?? ''} className="h-8 w-28">
                      <option value="">—</option>
                      {Object.entries(SKILL_LEVEL_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </fieldset>
      <SubmitButton className="self-start">حفظ الملف</SubmitButton>
    </ActionForm>
  );
}

/** الموافقة العامة (shareWithPartners): المنح عبر ConsentDialog، والسحب بنقرة وفي أي وقت (§6.8) */
export function ConsentToggle({
  shared,
  updatedAt,
  dataPoints,
}: {
  shared: boolean;
  updatedAt: Date | null;
  dataPoints: readonly string[];
}) {
  const formId = `consent-${useId()}`;
  const value = useRef<HTMLInputElement>(null);
  const [asking, setAsking] = useState(false);
  const submit = (v: string) => {
    if (value.current) value.current.value = v;
    (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit();
  };

  return (
    <>
      <ActionForm action={setConsentAction} id={formId} className="gap-2">
        {/* الافتراضي فارغ = لا موافقة: بلا JavaScript لا تُمنح موافقة دون الحوار */}
        <input ref={value} type="hidden" name="shareWithPartners" defaultValue="" />
        <p className="text-sm">
          {shared ? 'ملفك متاح للمؤسسات الشريكة الموافَق عليها.' : 'ملفك غير مُشارك مع أي مؤسسة.'}
          {updatedAt ? <span className="text-muted-foreground"> — آخر تغيير {formatDateTime(updatedAt)}</span> : null}
        </p>
        {shared ? (
          <>
            <p className="text-xs text-muted-foreground">
              السحب يوقف ظهور ملفك من الآن، ولا يحذف طلبات فرص قدّمتها بموافقتك: لكل طلب موافقته الخاصة.
            </p>
            <SubmitButton
              variant="outline"
              className="self-start"
              onClick={(e) => {
                e.preventDefault();
                submit('');
              }}
            >
              سحب موافقتي
            </SubmitButton>
          </>
        ) : (
          <SubmitButton
            variant="outline"
            className="self-start"
            onClick={(e) => {
              e.preventDefault();
              setAsking(true);
            }}
          >
            مشاركة ملفي مع المؤسسات
          </SubmitButton>
        )}
      </ActionForm>
      <ConsentDialog
        open={asking}
        purpose="لتعرف المؤسسات الشريكة مهارات الشباب الباحثين عن فرص وتتواصل مع من يناسبها. لا تغني هذه الموافقة عن موافقتك عند كل طلب فرصة."
        recipient="المؤسسات الشريكة المربوطة بالمجلس"
        dataPoints={dataPoints}
        onAccept={() => {
          setAsking(false);
          submit('true');
        }}
        onDecline={() => setAsking(false)}
      />
    </>
  );
}
