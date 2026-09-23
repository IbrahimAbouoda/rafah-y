import { COMPLAINT_RETENTION } from '@/lib/config';

/** بند الخصوصية في نموذج التقديم — PRD §6.6 · §6.7 · §6.8 · D18 */
export function PrivacyNotice({ visitor }: { visitor: boolean }) {
  return (
    <>
      <p className="mb-1 font-medium text-foreground">الخصوصية</p>
      <ul className="list-disc space-y-1 ps-4">
        <li>بيانات التواصل — إن كتبتها — تُحفظ مشفّرة، ولا يفتحها إلا من يعالج شكواك، وكل فتح لها يُسجَّل.</li>
        <li>
          {visitor
            ? 'لا نربط الشكوى بأي حساب، ولا نحفظ عنوان جهازك (IP) معها.'
            : 'إن أخفيت هويتك فلا نربط الشكوى بحسابك، ولا نحفظ عنوان جهازك (IP) معها.'}
        </li>
        <li>
          تُحفظ الشكوى {COMPLAINT_RETENTION.keepYears} سنوات. بعد {COMPLAINT_RETENTION.anonymizeAfterClosedYears} سنوات من إغلاقها
          تُمحى بيانات التواصل وربطها بصاحبها، وتبقى معلومات عامة لا تعرّف بك (التصنيف والمنطقة والحالة والتواريخ) للإحصاء.
        </li>
        <li>لا يرى العامة ولا مقدّمو الشكاوى الآخرون أي شيء من شكواك.</li>
      </ul>
    </>
  );
}
