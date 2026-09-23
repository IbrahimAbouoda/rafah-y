import type { Metadata } from 'next';
import Link from 'next/link';
import { appUrl } from '@/lib/config';
import { db } from '@/lib/db';
import { submitPublicComplaintAction } from '@/server/actions/complaints/submit';
import { ComplaintForm } from '@/components/complaints/complaint-form';
import { PrivacyNotice } from '@/components/complaints/privacy-notice';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/states';
import { Card } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'تقديم شكوى بلا حساب' };

// الصفحة تقرأ التصنيفات والمناطق في كل طلب
export const dynamic = 'force-dynamic';

// شكوى زائر — PRD §19.3 D1: بلا حساب، submitterId = NULL دائمًا، حد معدل مشدّد (D21)
export default async function PublicComplaintPage() {
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
        title="تقديم شكوى بلا حساب"
        description="تصل شكواك أمانة السر برقم مرجعي ورمز متابعة. لديك حساب؟ سجّل الدخول لتصلك التحديثات إشعارًا."
      >
        <Link href="/login?next=/me/complaints/new" className="text-sm text-brand hover:underline">
          الدخول بحسابي
        </Link>
      </PageHeader>
      {categories.length === 0 ? (
        <Card>
          <EmptyState
            title="تقديم الشكاوى لم يُفتح بعد"
            hint="لم تُضف تصنيفات الشكاوى من إعدادات المجلس بعد. عد لاحقًا، أو تواصل مع أمانة السر."
          />
        </Card>
      ) : (
        <ComplaintForm
          scope="public"
          submit={submitPublicComplaintAction}
          categories={categories}
          areas={areas}
          trackUrl={`${appUrl()}/track`}
          allowAnonymousToggle={false}
          privacyNotice={<PrivacyNotice visitor />}
        />
      )}
    </>
  );
}
