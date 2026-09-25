// مسودة Concept Note من قالب ثابت — AC-12. بلا ذكاء اصطناعي (C16 · §10): النص من بيانات الاستطلاع وحدها،
// والأرقام من قاعدة البيانات لا مولَّدة. تبدأ DRAFT دائمًا، ولا تُرسل قبل اعتماد الرئيس (C15).

export function conceptNoteDraft(input: {
  pollTitle: string;
  pollDescription: string | null;
  optionLabel: string;
  voterCount: number;
  totalVoters: number;
  threshold: number;
  initiativeTitle?: string | null;
}): { title: string; bodyMd: string } {
  const share = input.totalVoters > 0 ? Math.round((input.voterCount / input.totalVoters) * 100) : 0;
  const title = `مقترح تدريب: ${input.optionLabel}`;
  const bodyMd = [
    `# ${title}`,
    '',
    '## الخلفية',
    `طرح المجلس البلدي الشبابي في رفح استطلاع «${input.pollTitle}» على شباب المنصة لتحديد مجالات التدريب الأكثر طلبًا.`,
    ...(input.pollDescription ? ['', input.pollDescription] : []),
    '',
    '## الطلب الموثّق',
    `- المجال: **${input.optionLabel}**`,
    `- عدد المصوّتين لهذا المجال: **${input.voterCount}** (${share}٪ من ${input.totalVoters} مشاركًا في الاستطلاع)`,
    `- حد المقترح الذي أقرّه المجلس: ${input.threshold} صوتًا`,
    ...(input.initiativeTitle ? [`- المبادرة المرتبطة: ${input.initiativeTitle}`] : []),
    '',
    '## المقترح',
    '<!-- تكتبه لجنة المؤسسات والشراكات: الأهداف، الفئة المستهدفة، المدة، المدرّبون، المكان -->',
    '',
    '## الاحتياجات والميزانية التقديرية',
    '<!-- بالشيكل، بندًا بندًا -->',
    '',
    '---',
    'مسودة مولّدة آليًا من بيانات الاستطلاع. لا تُرسل لأي جهة قبل اعتماد رئيس المجلس.',
  ].join('\n');
  return { title, bodyMd };
}
