import type { PrismaClient } from '../lib/generated/prisma/client';

// بذرة FAQ — PRD §13.6: اثنا عشر سؤالًا معتمدًا مبدئيًا في البذرة الأساسية (الإنتاج أيضًا، مثل المهارات — D32).
// نصوص الإجابات يكتبها المجلس (Q11): هذه إجابات مبدئية من وصف المنصة، تُراجَع من /admin/settings/faq قبل الإطلاق.
// لا تُغيَّر إجابة موجودة: قد يكون المجلس عدّلها.

export const FAQ_CATEGORIES = [
  { slug: 'about', nameAr: 'عن المجلس', sortOrder: 1 },
  { slug: 'complaints', nameAr: 'الشكاوى', sortOrder: 2 },
  { slug: 'ideas-initiatives', nameAr: 'الأفكار والمبادرات', sortOrder: 3 },
  { slug: 'participation', nameAr: 'المشاركة والتطوع', sortOrder: 4 },
  { slug: 'partners', nameAr: 'المؤسسات والدعم', sortOrder: 5 },
] as const;

type Slug = (typeof FAQ_CATEGORIES)[number]['slug'];

/** formerQuestions: صياغات سابقة للسؤال — تمنع تكرار البذرة في قاعدة بُذرت قبل تغيير الصياغة */
export const BASE_FAQ: { category: Slug; question: string; formerQuestions?: string[]; answerMd: string; keywords: string[] }[] = [
  {
    category: 'about',
    question: 'ما هو المجلس الشبابي البلدي - رفح؟',
    formerQuestions: ['ما هو المجلس البلدي الشبابي؟'],
    answerMd: 'مجلس من شباب رفح يعمل مع البلدية لإيصال صوت الشباب: يستقبل شكاواهم وأفكارهم، وتعمل عليها لجان متخصصة، وتُنشر نتائج عمله للعامة في [صفحة الشفافية](/transparency).',
    keywords: ['المجلس', 'المجلس الشبابي البلدي', 'المجلس البلدي الشبابي', 'من انتم', 'تعريف'],
  },
  {
    category: 'about',
    question: 'ما مهام المجلس؟',
    answerMd: '- متابعة شكاوى الشباب حتى حلها\n- دراسة أفكارهم وتحويل الجيد منها إلى مبادرات\n- تنظيم الأنشطة والفرص\n- التنسيق مع المؤسسات الداعمة\n- نشر تقارير دورية بأرقام موثّقة',
    keywords: ['مهام', 'مهام المجلس', 'دور المجلس', 'عمل المجلس'],
  },
  {
    category: 'ideas-initiatives',
    question: 'كيف أقدّم فكرة؟',
    answerMd: 'سجّل الدخول ثم اختر **أفكاري ← فكرة جديدة**: اكتب المشكلة والحل المقترح والكلفة التقديرية إن عرفتها. تُراجَع الفكرة ويصلك إشعار بالقرار، ويمكن للشباب التصويت عليها في [صفحة الأفكار](/ideas).',
    keywords: ['فكرة', 'تقديم فكرة', 'اقتراح', 'افكار'],
  },
  {
    category: 'complaints',
    question: 'كيف أقدّم شكوى؟',
    answerMd: 'من [تقديم شكوى](/complaints/public-new) بلا حساب، أو من حسابك لتتابعها بسهولة. اكتب عنوانًا واضحًا والتفاصيل والمنطقة. تحصل على **رقم مرجعي ورمز سري** — احفظهما لمتابعة الشكوى.',
    keywords: ['شكوى', 'تقديم شكوى', 'مشكلة', 'بلاغ'],
  },
  {
    category: 'complaints',
    question: 'كيف أتابع شكواي؟',
    answerMd: 'من [صفحة التتبّع](/track) بالرقم المرجعي والرمز السري. إن قدّمتها من حسابك تجدها في **شكاواي**، وتصلك إشعارات مع كل تحديث عليها.',
    keywords: ['تتبع', 'متابعة شكوى', 'رقم مرجعي', 'رمز سري', 'حالة الشكوى'],
  },
  {
    category: 'participation',
    question: 'كيف أشارك في الأنشطة؟',
    answerMd: 'تصفّح [الأنشطة](/activities) وسجّل في ما يناسبك من حسابك. يصلك تأكيد التسجيل، وبعد النشاط يمكنك تقييمه.',
    keywords: ['نشاط', 'انشطة', 'ورشة', 'فعالية', 'تسجيل في نشاط'],
  },
  {
    category: 'participation',
    question: 'كيف أصبح متطوعًا؟',
    answerMd: 'أكمل ملفك الشخصي ومهاراتك، ثم تابع فرص التطوع في [الفرص](/opportunities) والأنشطة المنشورة. اللجان تعلن حاجتها للمتطوعين هناك.',
    keywords: ['تطوع', 'متطوع', 'التطوع'],
  },
  {
    category: 'ideas-initiatives',
    question: 'كيف أقترح مبادرة؟',
    answerMd: 'ابدأ بفكرة من **أفكاري**. الأفكار المعتمدة تتحول إلى مبادرات بلجنة مسؤولة واحتياجات مرقّمة تظهر في [المبادرات](/initiatives).',
    keywords: ['مبادرة', 'اقتراح مبادرة', 'مبادرات'],
  },
  {
    category: 'about',
    question: 'كيف أتواصل مع لجنة؟',
    answerMd: 'تجد لجان المجلس ومجالاتها في [صفحة اللجان](/committees). الشكوى أو الفكرة تُحوَّل تلقائيًا للجنة المختصة، ويمكنك إرسال استفسار لفريق المجلس من هذه الصفحة.',
    keywords: ['لجنة', 'اللجان', 'تواصل', 'التواصل مع لجنة'],
  },
  {
    category: 'participation',
    question: 'ما الفرص المتاحة للشباب؟',
    answerMd: 'تدريب ومنح وفرص عمل وتطوع تنشرها المؤسسات الشريكة بعد مراجعة المجلس، في [صفحة الفرص](/opportunities). تقدّم من حسابك، وتختار بنفسك مشاركة ملفك مع المؤسسة أو لا.',
    keywords: ['فرص', 'فرصة', 'تدريب', 'منحة', 'عمل', 'وظيفة'],
  },
  {
    category: 'partners',
    question: 'كيف تتعاون المؤسسات مع المجلس؟',
    answerMd: 'تطّلع المؤسسة على احتياجات المبادرات المرقّمة، وتقدّم عرض دعم (تمويل أو تدريب أو معدات أو خبرة)، وتنشر فرصها للشباب — كل ذلك من بوابة المؤسسات بعد ربط حسابها بالمجلس.',
    keywords: ['مؤسسة', 'مؤسسات', 'شراكة', 'تعاون', 'شريك'],
  },
  {
    category: 'partners',
    question: 'كيف أقدّم دعمًا للمجلس؟',
    answerMd: 'من [ادعمنا](/support) تجد المبادرات واحتياجاتها. الأفراد والمؤسسات يتواصلون مع المجلس لتنسيق الدعم، ويُسجَّل كل دعم مالي في السجل المالي المعتمد.',
    keywords: ['دعم', 'تبرع', 'ادعم', 'تمويل', 'ادعمنا'],
  },
];

export async function seedFaq(db: PrismaClient) {
  const ids = new Map<string, string>();
  for (const c of FAQ_CATEGORIES) {
    const row = await db.faqCategory.upsert({ where: { slug: c.slug }, create: c, update: {} });
    ids.set(c.slug, row.id);
  }
  for (const f of BASE_FAQ) {
    const exists = await db.faqEntry.findFirst({ where: { question: { in: [f.question, ...(f.formerQuestions ?? [])] } }, select: { id: true } });
    if (exists) continue;
    await db.faqEntry.create({
      data: { categoryId: ids.get(f.category)!, question: f.question, answerMd: f.answerMd, keywords: f.keywords },
    });
  }
}
