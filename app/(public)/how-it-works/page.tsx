import type { Metadata } from 'next';
import Link from 'next/link';
import { STAGES, STATUS_LABELS } from '@/lib/complaints/workflow';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'كيف تعمل المنصة' };

// /how-it-works — PRD §11.2. شرح ثابت مأخوذ من المسارات المعتمدة (§5) وقواعد الخصوصية (§6)،
// ومراحل الشكوى من lib/complaints/workflow.ts نفسها فلا يختلف الشرح عن المنصة. يُقرأ بلا اتصال (§7.1).

const SECTIONS = [
  {
    id: 'ideas',
    title: 'الفكرة',
    steps: [
      'تكتب المشكلة والحل المقترح من حسابك.',
      'يصوّت عليها الشباب في صفحة الأفكار، وتراجعها لجنة مختصة.',
      'تُعتمد أو تُطلب تعديلات أو تُدمج بفكرة مشابهة، ويصلك إشعار بالقرار.',
      'الفكرة المعتمدة تصير مبادرة بلجنة مسؤولة.',
    ],
    link: { href: '/ideas', label: 'الأفكار' },
  },
  {
    id: 'initiatives',
    title: 'المبادرات والدعم',
    steps: [
      'لكل مبادرة احتياجات مرقّمة: تمويل، تدريب، مكان، معدات، خبرة.',
      'المؤسسات تقدّم عروض دعم، ويقرّها رئيس المجلس.',
      'المبلغ المؤمَّن يُحسب من القيود المالية المعتمدة فقط، لا من الوعود.',
    ],
    link: { href: '/initiatives', label: 'المبادرات' },
  },
  {
    id: 'opportunities',
    title: 'الفرص والأنشطة',
    steps: [
      'المؤسسات تنشر فرصًا تراجعها المجلس قبل ظهورها.',
      'تتقدّم من حسابك، وتختار بنفسك مشاركة ملفك مع المؤسسة أو لا.',
      'تسجّل في الأنشطة، ويُسجَّل حضورك، ثم تقيّم النشاط.',
    ],
    link: { href: '/opportunities', label: 'الفرص' },
  },
  {
    id: 'transparency',
    title: 'الشفافية',
    steps: [
      'يولّد المجلس تقارير دورية بمؤشرات محسوبة من قاعدة البيانات مباشرة.',
      'أرقام التقرير لقطة ثابتة يوم إعداده: لا تتغيّر بعد نشره.',
      'التقارير المنشورة متاحة للجميع بلا تسجيل دخول، وبلا أي بيانات شخصية.',
    ],
    link: { href: '/transparency', label: 'صفحة الشفافية' },
  },
] as const;

const PRIVACY = [
  'يمكنك تقديم شكوى مجهولة: لا يظهر اسمك لأحد، وتتابعها بالرقم المرجعي والرمز السري فقط.',
  'بيانات التواصل مشفّرة، ولا يقرؤها إلا من تحتاج شكواك تواصله معك، وكل قراءة مسجّلة.',
  'ملفك لا يصل لمؤسسة إلا بموافقتك الصريحة على كل طلب.',
  'التقارير والتصدير بلا أسماء ولا أرقام هواتف.',
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        title="كيف تعمل المنصة"
        description="كل ما يدخل المنصة يمشي في مسار موثّق: من يستلمه، ومن يعمل عليه، ومتى — وتصلك التحديثات أولًا بأول."
      />
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>الشكوى</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm leading-7">
            <p>
              تقدّمها من حسابك أو <Link href="/complaints/public-new" className="text-brand hover:underline">بلا حساب</Link>، فتحصل على رقم
              مرجعي ورمز سري. يفرزها المجلس ويحوّلها للجنة المختصة، ويمكن إحالتها لجهة خارجية كالبلدية مع موعد متابعة.
            </p>
            <ol className="flex flex-wrap gap-2" aria-label="مراحل الشكوى">
              {STAGES.map((s, i) => (
                <li key={s} className="rounded-full border px-3 py-1 text-xs">
                  {i + 1}. {STATUS_LABELS[s]}
                </li>
              ))}
            </ol>
            <p>
              تابعها في أي وقت من <Link href="/track" className="text-brand hover:underline">صفحة التتبّع</Link>. المسودة تُحفظ على جهازك
              إن انقطع الاتصال، وتُرسل حين يعود.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {SECTIONS.map((s) => (
            <Card key={s.id}>
              <CardHeader>
                <CardTitle>{s.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm leading-7">
                <ol className="flex list-decimal flex-col gap-1 ps-5">
                  {s.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <Link href={s.link.href} className="self-start text-brand hover:underline">
                  {s.link.label}
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>خصوصيتك</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex list-disc flex-col gap-1 ps-5 text-sm leading-7">
              {PRIVACY.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground">
          سؤال لم تجد جوابه هنا؟ <Link href="/help" className="text-brand hover:underline">اسأل في صفحة المساعدة</Link>.
        </p>
      </div>
    </>
  );
}
