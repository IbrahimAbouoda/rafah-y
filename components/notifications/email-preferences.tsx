import { EMAIL_TYPE_LABELS, EMAIL_TYPES } from '@/lib/notifications/preferences';
import { setEmailPreferencesAction } from '@/server/actions/notifications';
import { ActionForm, SubmitButton } from '@/components/shared/action-form';
import { Checkbox } from '@/components/ui/form-controls';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surface';

// §8.3 — إيقاف البريد لكل نوع. إشعارات المنصة لا تُوقف، فتظهر مفعّلة ومقفلة لتوضيح ذلك لا لإخفائه.
export function EmailPreferences({ disabled, email }: { disabled: Set<string>; email: string | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>تفضيلات البريد</CardTitle>
        <CardDescription>
          {email
            ? `اختر ما يصلك بريديًا على ${email}. إشعارات المنصة تصلك دائمًا ولا يمكن إيقافها، حتى لا يفوتك تحديث على شكواك أو طلبك.`
            : 'لا بريد في حسابك، فلا يصلك شيء بريديًا. أضف بريدًا من ملفك الشخصي لتفعيل هذه الخيارات. إشعارات المنصة تصلك دائمًا.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={setEmailPreferencesAction}>
          <fieldset className="flex flex-col divide-y rounded-lg border" disabled={!email}>
            <legend className="sr-only">أنواع الإشعارات البريدية</legend>
            {EMAIL_TYPES.map((type) => {
              const { label, who } = EMAIL_TYPE_LABELS[type];
              return (
                <label key={type} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span className="flex flex-col">
                    <span className="font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground">يخصّ: {who}</span>
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title="لا يمكن إيقاف إشعارات المنصة (§8.3)">
                      <Checkbox checked disabled aria-label={`${label}: داخل المنصة — دائمًا`} readOnly />
                      المنصة
                    </span>
                    <span className="flex items-center gap-1.5 text-xs">
                      <Checkbox name="email" value={type} defaultChecked={!disabled.has(type)} aria-label={`${label}: البريد`} />
                      البريد
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          {email ? <SubmitButton className="self-start">حفظ التفضيلات</SubmitButton> : null}
        </ActionForm>
      </CardContent>
    </Card>
  );
}
