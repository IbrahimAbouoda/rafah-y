import type { Metadata } from 'next';
import { appUrl } from '@/lib/config';
import { db } from '@/lib/db';
import { guardPage } from '@/lib/page-guard';
import { submitComplaintAction } from '@/server/actions/complaints/submit';
import { ComplaintForm } from '@/components/complaints/complaint-form';
import { PrivacyNotice } from '@/components/complaints/privacy-notice';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, Forbidden } from '@/components/shared/states';
import { Card } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'تقديم شكوى' };

export default async function NewComplaintPage() {
  const { user, allowed, backHref } = await guardPage('/me/complaints/new', 'complaints:create');
  if (!allowed) return <Forbidden backHref={backHref} />;

  const [categories, areas] = await Promise.all([
    db.complaintCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
      select: { id: true, nameAr: true },
    }),
    db.area.findMany({ orderBy: { nameAr: 'asc' }, select: { id: true, nameAr: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="تقديم شكوى"
        description="تصل شكواك أمانة السر برقم مرجعي، وتُحوَّل للجنة المختصة. تتابع كل خطوة من «شكاواي» أو بالرقم والرمز."
      />
      {categories.length === 0 ? (
        <Card>
          <EmptyState
            title="تقديم الشكاوى لم يُفتح بعد"
            hint="لم تُضف تصنيفات الشكاوى من إعدادات المجلس بعد. عد لاحقًا، أو تواصل مع أمانة السر."
          />
        </Card>
      ) : (
        <ComplaintForm
          scope={`account:${user.id}`}
          submit={submitComplaintAction}
          categories={categories}
          areas={areas}
          trackUrl={`${appUrl()}/track`}
          allowAnonymousToggle
          privacyNotice={<PrivacyNotice visitor={false} />}
        />
      )}
    </>
  );
}
