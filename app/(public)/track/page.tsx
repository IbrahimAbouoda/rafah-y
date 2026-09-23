import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { TrackForm } from './track-form';

export const metadata: Metadata = { title: 'تتبّع شكوى' };

// الرقم وحده قد يأتي في الرابط (مشاركة واتساب)؛ الرمز لا يُقبل في الرابط أبدًا — يُكتب يدويًا.
export default async function TrackPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const initialReference = typeof ref === 'string' && /^RF-CMP-\d{4}-\d{6}$/i.test(ref) ? ref.toUpperCase() : '';
  return (
    <>
      <PageHeader
        title="تتبّع شكوى"
        description="اكتب الرقم المرجعي ورمز المتابعة كما ظهرا لك عند التقديم. لا تحتاج حسابًا، والشكوى المجهولة تُتابَع بالطريقة نفسها."
      />
      <TrackForm initialReference={initialReference} />
    </>
  );
}
