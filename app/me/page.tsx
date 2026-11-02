import type { Metadata } from 'next';
import Link from 'next/link';
import { Bell, CircleCheck, FilePlus2, FolderOpen, Search } from 'lucide-react';
import { guardPage } from '@/lib/page-guard';
import { can } from '@/lib/rbac';
import { PageHeader } from '@/components/shared/page-header';
import { StatTile } from '@/components/shared/stat-tile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surface';
import { myComplaintCounts } from '@/lib/complaints/queries';
import { unreadCount } from '@/lib/shell';

export const metadata: Metadata = { title: 'لوحتي' };

export default async function MePage() {
  const { user } = await guardPage('/me', null);
  const canCreate = can(user, 'complaints:create');

  // «شكاواي» = ما قدّمه باسمه فقط؛ المجهولة غير مربوطة بحسابه أصلًا (§6.7)
  const [{ open, resolved }, unread] = await Promise.all([myComplaintCounts(user.id), unreadCount(user.id)]);

  return (
    <>
      <PageHeader title={`أهلًا ${user.fullName}`} description="من هنا تقدّم شكواك وتتابعها وتصلك تحديثاتها." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="شكاوى قيد المعالجة" value={open} href="/me/complaints" tone="brand" icon={FolderOpen} />
        <StatTile label="شكاوى حُلّت" value={resolved} href="/me/complaints" tone="success" icon={CircleCheck} />
        <StatTile label="إشعارات غير مقروءة" value={unread} href="/me/notifications" icon={Bell} />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {canCreate ? (
          <Card>
            <CardHeader>
              <CardTitle>عندك مشكلة في حيّك أو خدمة لا تعمل؟</CardTitle>
              <CardDescription>
                قدّم شكوى برقم مرجعي. تصل أمانة السر، وتُحوَّل للجنة المختصة، وتتابع كل خطوة بنفسك. يمكنك إخفاء هويتك.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/me/complaints/new">
                  <FilePlus2 aria-hidden />
                  تقديم شكوى
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>قدّمت شكوى مجهولة؟</CardTitle>
            <CardDescription>
              الشكاوى المجهولة لا تظهر في حسابك حفاظًا على هويتك. تابعها بالرقم المرجعي ورمز المتابعة.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/track">
                <Search aria-hidden />
                تتبّع شكوى
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
