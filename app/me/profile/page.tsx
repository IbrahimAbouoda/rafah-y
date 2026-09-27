import type { Metadata } from 'next';
import { db } from '@/lib/db';
import type { SkillLevel } from '@/lib/generated/prisma/enums';
import { PROFILE_DATA_POINTS } from '@/lib/opportunities/workflow';
import { guardPage } from '@/lib/page-guard';
import { ConsentToggle, ProfileForm } from '@/components/profile/profile-form';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'ملفي ومهاراتي' };

// /me/profile — profiles:update («خاص»): الملف والمهارات والموافقة العامة، لصاحبه وحده (§6.8)
export default async function ProfilePage() {
  const { user, allowed, backHref } = await guardPage('/me/profile', 'profiles:update');
  if (!allowed) return <Forbidden backHref={backHref} />;

  const [profile, mySkills, areas, skills] = await Promise.all([
    db.youthProfile.findUnique({ where: { userId: user.id } }),
    db.youthSkill.findMany({ where: { userId: user.id }, select: { skillId: true, level: true } }),
    db.area.findMany({ orderBy: { nameAr: 'asc' }, select: { id: true, nameAr: true } }),
    db.skill.findMany({ orderBy: [{ category: 'asc' }, { nameAr: 'asc' }], select: { id: true, nameAr: true, category: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="ملفي ومهاراتي"
        description="ملف مختصر يساعد الجهات على معرفة ما تجيده. لا نطلب رقم هوية ولا عنوانًا تفصيليًا ولا تاريخ ميلاد كاملًا."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle>بياناتي</CardTitle>
            <CardDescription>
              {user.fullName}
              {user.email ? ` · ${user.email}` : ''}
              {user.phone ? ` · ${user.phone}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              profile={profile}
              areas={areas.map((a) => ({ id: a.id, name: a.nameAr }))}
              skills={skills.map((s) => ({ id: s.id, name: s.nameAr, category: s.category }))}
              mySkills={Object.fromEntries(mySkills.map((s) => [s.skillId, s.level])) as Record<string, SkillLevel>}
            />
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>المشاركة مع المؤسسات</CardTitle>
            <CardDescription>
              موافقة عامة اختيارية، مؤرّخة، وتسحبها متى شئت. طلبات الفرص لها موافقة منفصلة عند كل طلب.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConsentToggle
              shared={profile?.shareWithPartners ?? false}
              updatedAt={profile?.consentUpdatedAt ?? null}
              dataPoints={PROFILE_DATA_POINTS}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
