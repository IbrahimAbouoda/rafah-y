import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { guardPage } from '@/lib/page-guard';
import { submitIdeaAction } from '@/server/actions/ideas';
import { IdeaForm } from '@/components/ideas/idea-form';
import { PageHeader } from '@/components/shared/page-header';
import { Forbidden } from '@/components/shared/states';

export const metadata: Metadata = { title: 'تقديم فكرة' };

// /me/ideas/new — ideas:create (AC-07)
export default async function NewIdeaPage() {
  const { user, allowed, backHref } = await guardPage('/me/ideas/new', 'ideas:create');
  if (!allowed) return <Forbidden backHref={backHref} />;
  const areas = await db.area.findMany({ orderBy: { nameAr: 'asc' }, select: { id: true, nameAr: true } });
  return (
    <>
      <PageHeader
        title="تقديم فكرة"
        description="صف المشكلة والحل. تفرزها أمانة السر، ثم تراجعها اللجنة المختصة، والقرار النهائي لرئيس المجلس. يستطيع الشباب تأييدها بعد الفرز."
      />
      <IdeaForm scope={`idea:${user.id}`} submit={submitIdeaAction} areas={areas} />
    </>
  );
}
