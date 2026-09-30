import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Briefcase,
  Calendar,
  CircleCheck,
  ClipboardCheck,
  Activity,
  Lightbulb,
  Megaphone,
  MessageSquare,
  Rocket,
  Send,
  type LucideIcon,
} from 'lucide-react';
import { COUNCIL_NAME_AR } from '@/lib/config';
import { cn } from '@/lib/utils';
import { CivicIllustration } from '@/components/home/civic-illustration';
import { HomeNumbers, HomeNumbersSkeleton } from '@/components/home/home-numbers';
import { HomeUpdates, HomeUpdatesSkeleton } from '@/components/home/home-updates';
import { Button } from '@/components/ui/button';
import { Card, interactiveCard } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'نبض رفح — منصة الشباب' };
export const dynamic = 'force-dynamic';

// / — الرئيسية (PRD §11.2). عامة بلا تسجيل دخول، وتُقرأ بلا اتصال من ذاكرة Service Worker (§7.1).
// المستجدات والأرقام من سجلات منشورة فعلًا (components/home)، كلٌّ بحالاته الثلاث وحدّه الخاص للتحميل.

type Tone = 'brand' | 'accent' | 'alert';
const TINT: Record<Tone, string> = {
  brand: 'bg-brand/10 text-brand',
  accent: 'bg-accent/10 text-council-green-dark dark:text-accent',
  alert: 'bg-alert/10 text-alert',
};

const PATHS: { href: string; title: string; text: string; icon: LucideIcon; tone: Tone }[] = [
  {
    href: '/complaints/public-new',
    title: 'قدّم شكوى',
    text: 'مشكلة في حيّك أو خدمة؟ اكتبها، ولو بلا حساب، واحصل على رقم مرجعي تتابعها به.',
    icon: Megaphone,
    tone: 'alert',
  },
  { href: '/ideas', title: 'شارك فكرة', text: 'اقترح حلًا وصوّت على أفكار غيرك. الأفكار المعتمدة تصير مبادرات.', icon: Lightbulb, tone: 'accent' },
  { href: '/initiatives', title: 'المبادرات', text: 'ما تعمل عليه اللجان الآن، واحتياجاته المرقّمة، ومن يدعمه.', icon: Rocket, tone: 'brand' },
  { href: '/opportunities', title: 'الفرص', text: 'تدريب ومنح وفرص عمل وتطوع من المؤسسات الشريكة.', icon: Briefcase, tone: 'brand' },
  { href: '/activities', title: 'الأنشطة', text: 'ورش وفعاليات وحملات — سجّل وشارك.', icon: Calendar, tone: 'accent' },
  { href: '/help', title: 'اسأل', text: 'إجابات معتمدة من المجلس، وما لا تجده يصل لفريقه.', icon: MessageSquare, tone: 'brand' },
];

// مسار الشكوى مبسّطًا — المراحل الكاملة في /how-it-works من lib/complaints/workflow.ts
const STEPS: { title: string; text: string; icon: LucideIcon }[] = [
  { title: 'أرسل', text: 'اكتب شكواك أو فكرتك، واحصل على رقم مرجعي فورًا.', icon: Send },
  { title: 'المراجعة', text: 'يفرزها المجلس ويحوّلها إلى اللجنة المختصة.', icon: ClipboardCheck },
  { title: 'المتابعة', text: 'تتابع كل مرحلة بالرقم المرجعي، وتصلك التحديثات.', icon: Activity },
  { title: 'النتيجة', text: 'تُغلق بحلّ موثّق، وتدخل أرقامها تقارير الشفافية.', icon: CircleCheck },
];

function SectionHeading({ id, title, link }: { id: string; title: string; link?: { href: string; label: string } }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id={id} className="text-xl font-bold">
        {title}
      </h2>
      {link ? (
        <Link href={link.href} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
          {link.label}
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col gap-12 sm:gap-16">
      <section aria-labelledby="hero" className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-7">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-council-green-dark dark:text-accent">
            <BadgeCheck className="size-4" aria-hidden />
            المنصة الرقمية الرسمية
          </span>
          <div className="flex flex-col gap-2">
            <h1 id="hero" className="text-4xl font-bold leading-tight text-brand sm:text-5xl">
              نبض رفح
            </h1>
            <p className="text-lg font-semibold sm:text-xl">صوت الشباب... فكرة تتحول إلى أثر</p>
          </div>
          <p className="max-w-xl text-base leading-8 text-muted-foreground">
            منصة {COUNCIL_NAME_AR}: شكاوى الشباب وأفكارهم ومبادراتهم تدخل بمسار موثّق، تعمل عليها تسع لجان، وتُنشر نتائجها للجميع.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/complaints/public-new">
                <Megaphone aria-hidden />
                قدّم شكوى
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/how-it-works">كيف تعمل المنصة؟</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            قدّمت شكوى من قبل؟{' '}
            <Link href="/track" className="font-medium text-brand hover:underline">
              تتبّعها بالرقم المرجعي
            </Link>
          </p>
        </div>
        <div className="lg:col-span-5">
          <CivicIllustration className="mx-auto w-full max-w-72 sm:max-w-sm lg:max-w-none" />
        </div>
      </section>

      <section aria-labelledby="paths" className="flex flex-col gap-4">
        <SectionHeading id="paths" title="ماذا تستطيع أن تفعل" />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PATHS.map((p) => {
            const Icon = p.icon;
            return (
              <li key={p.href}>
                <Link
                  href={p.href}
                  className="group block h-full rounded-2xl focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Card className={cn('flex h-full flex-col gap-3 p-5', interactiveCard)}>
                    <span className={cn('flex size-11 items-center justify-center rounded-xl', TINT[p.tone])}>
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="text-base font-semibold group-hover:text-brand">{p.title}</span>
                    <span className="text-sm leading-6 text-muted-foreground">{p.text}</span>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="steps" className="flex flex-col gap-4">
        <SectionHeading id="steps" title="كيف تعمل المنصة؟" link={{ href: '/how-it-works', label: 'الشرح الكامل' }} />
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <li key={s.title} className="flex gap-3 rounded-xl border bg-surface p-4 lg:flex-col">
                <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
                  <Icon className="size-5" aria-hidden />
                  <span className="absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full border-2 border-surface bg-council-green-dark text-[11px] font-bold text-white dark:bg-accent dark:text-accent-foreground">
                    {i + 1}
                  </span>
                </span>
                <span className="flex flex-col gap-1">
                  <span className="font-semibold">{s.title}</span>
                  <span className="text-sm leading-6 text-muted-foreground">{s.text}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid gap-12 lg:grid-cols-5 lg:gap-8">
        <section aria-labelledby="updates" className="flex flex-col gap-4 lg:col-span-3">
          <SectionHeading id="updates" title="آخر المستجدات" link={{ href: '/activities', label: 'كل الأنشطة' }} />
          <Suspense fallback={<HomeUpdatesSkeleton />}>
            <HomeUpdates />
          </Suspense>
        </section>

        <section aria-labelledby="ask" className="flex flex-col gap-4 lg:col-span-2">
          <SectionHeading id="ask" title="عندك سؤال؟" />
          <Card className="flex flex-1 flex-col gap-4 bg-brand-soft p-5">
            <span className="flex size-11 items-center justify-center rounded-xl bg-brand text-brand-foreground">
              <MessageSquare className="size-5" aria-hidden />
            </span>
            <p className="text-sm leading-7">
              مساعد الأسئلة يبحث في إجابات اعتمدها المجلس ويعرضها كما هي. وما لا يجد له إجابة يصل لفريق المجلس ليرد عليك، ولو بلا
              حساب.
            </p>
            <Button asChild className="mt-auto self-start">
              <Link href="/help">افتح المساعد</Link>
            </Button>
          </Card>
        </section>
      </div>

      <section aria-labelledby="numbers" className="flex flex-col gap-4">
        <SectionHeading id="numbers" title="المجلس بالأرقام" link={{ href: '/transparency', label: 'صفحة الشفافية' }} />
        <Suspense fallback={<HomeNumbersSkeleton />}>
          <HomeNumbers />
        </Suspense>
      </section>
    </div>
  );
}
