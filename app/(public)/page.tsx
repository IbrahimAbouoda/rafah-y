import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, FilePlus2, HandHeart, Lightbulb, Rocket, Search, type LucideIcon } from 'lucide-react';
import { APP_TAGLINE_AR, COUNCIL_NAME_AR, COUNCIL_NAME_EN } from '@/lib/config';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: { absolute: `نبض رفح | ${COUNCIL_NAME_AR}` } };

// أصناف كاملة حتى يلتقطها Tailwind: ألوان المجلس الثلاثة بالتناوب
const TONES = {
  blue: 'bg-brand-soft text-brand',
  green: 'bg-accent-soft text-accent-strong',
  red: 'bg-danger-soft text-council-red',
} as const;

const SERVICES: { href: string; title: string; text: string; icon: LucideIcon; tone: keyof typeof TONES }[] = [
  { href: '/complaints/public-new', title: 'تقديم شكوى', text: 'أوصل مشكلتك إلى اللجنة المختصة برقم مرجعي، بحساب أو دونه.', icon: FilePlus2, tone: 'blue' },
  { href: '/track', title: 'تتبّع شكوى', text: 'اعرف أين وصلت شكواك بالرقم المرجعي ورمز التتبّع.', icon: Search, tone: 'green' },
  { href: '/ideas', title: 'الأفكار', text: 'شارك فكرتك وصوّت لما تراه أولى بالتنفيذ.', icon: Lightbulb, tone: 'red' },
  { href: '/initiatives', title: 'المبادرات', text: 'تابع مبادرات الشباب المعتمدة واحتياجاتها المرقّمة.', icon: Rocket, tone: 'blue' },
  { href: '/committees', title: 'اللجان', text: 'تعرّف إلى لجان المجلس ومجال عمل كلٍّ منها.', icon: Building2, tone: 'green' },
  { href: '/support', title: 'ادعمنا', text: 'مدخل المؤسسات والداعمين إلى الاحتياجات المفتوحة.', icon: HandHeart, tone: 'red' },
];

// / — الرئيسية (§11.2)
export default function HomePage() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col items-center gap-4 py-6 text-center sm:py-10">
        <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent-strong">المنصة الرقمية الرسمية</span>
        <h1 className="text-3xl font-bold text-brand sm:text-4xl">نبض رفح</h1>
        <p className="flex flex-col gap-1 font-medium">
          <span>{COUNCIL_NAME_AR}</span>
          <span dir="ltr" className="text-sm font-normal text-muted-foreground">
            {COUNCIL_NAME_EN}
          </span>
        </p>
        <p className="max-w-xl text-muted-foreground">{APP_TAGLINE_AR}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild size="lg">
            <Link href="/complaints/public-new">قدم شكوى</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/initiatives">تصفّح المبادرات</Link>
          </Button>
        </div>
      </section>

      <section aria-label="خدمات المنصة" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map(({ href, title, text, icon: Icon, tone }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-start gap-3 rounded-xl border bg-surface p-4 transition hover:-translate-y-0.5 hover:border-brand hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <span className={`rounded-lg p-2.5 transition-transform group-hover:scale-110 motion-reduce:transition-none ${TONES[tone]}`}>
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="flex flex-col gap-1">
              <span className="font-semibold group-hover:text-brand">{title}</span>
              <span className="text-sm text-muted-foreground">{text}</span>
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
