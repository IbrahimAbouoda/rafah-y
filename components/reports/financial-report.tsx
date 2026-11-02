import { CURRENCIES } from '@/lib/config';
import type { ByCurrency, FinancialReport as Report } from '@/lib/finance/report';
import { formatMoney } from '@/lib/initiatives/workflow';

// «نموذج التقرير الإداري والمالي للمجلس الشبابي البلدي 2026» بصفحاته وأعمدته. القياسات بالنقطة من النموذج،
// وأصناف Tailwind لا style مضمّن (CSP §6.10). ما لا مصدر له في المنصة بعد يبقى خانة فارغة تُملأ يدويًا.

const DOTS = '........................';
const DATE_DOTS = '....../....../......';
const INCOME_ROWS = 10;
const CATEGORY_ROWS = 10;
const LOG_ROWS_PER_PAGE = 25;

const INDIC = '٠١٢٣٤٥٦٧٨٩';
const indic = (v: string | number) => String(v).replace(/\d/g, (d) => INDIC[Number(d)]!);
const money = (amount: string | { toString(): string }, currency: string) =>
  indic(formatMoney(amount.toString(), currency)).replace(/,/g, '٬').replace(/\./g, '٫');
const amountOnly = (amount: string | { toString(): string }, currency: string) => money(amount, currency).split(' ')[0]!;
const moneyLine = (values: ByCurrency | null) =>
  CURRENCIES.filter((c) => values?.[c] !== undefined)
    .map((c) => money(values![c]!, c))
    .join(' و ');

/** التواريخ مخزَّنة بمنتصف ليل UTC، فتُقرأ بـ UTC كما أُدخلت */
function reportDate(date: Date | null) {
  if (!date) return DATE_DOTS;
  const iso = date.toISOString();
  return indic(`${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`);
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out.length ? out : [[]];
}

const pad = <T,>(rows: T[], size: number): (T | null)[] => [...rows, ...Array<null>(Math.max(0, size - rows.length)).fill(null)];

type Cell = React.ReactNode | { v: React.ReactNode; c: string };
type Row = { cells: Cell[]; tone?: 'rp-tint' | 'rp-total' | 'rp-tall' };

const isStyled = (cell: Cell): cell is { v: React.ReactNode; c: string } => typeof cell === 'object' && cell !== null && 'c' in cell;
const label = (v: React.ReactNode): Cell => ({ v, c: 'rp-label' });
const strong = (v: React.ReactNode): Cell => ({ v, c: 'font-bold' });
/** نص طويل: سطران بخط أصغر حتى لا يطول الصف عن النموذج */
const small = (v: React.ReactNode): Cell => ({ v: v ? <div className="rp-clamp">{v}</div> : null, c: 'rp-small' });

function Grid({ widths, head, tallHead, rows }: { widths: string[]; head?: string[]; tallHead?: boolean; rows: Row[] }) {
  return (
    <table className="rp-table">
      <colgroup>
        {widths.map((w, i) => (
          <col key={i} className={w} />
        ))}
      </colgroup>
      <tbody>
        {head ? (
          <tr className={tallHead ? 'rp-head-tall' : undefined}>
            {head.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        ) : null}
        {rows.map((row, r) => (
          <tr key={r} className={row.tone}>
            {row.cells.map((cell, c) => (isStyled(cell) ? <td key={c} className={cell.c}>{cell.v}</td> : <td key={c}>{cell}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const Bar = ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={`rp-bar ${className ?? ''}`}>{children}</div>;
const Sub = ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={`rp-sub ${className ?? ''}`}>{children}</div>;

function Page({ first, children }: { first?: boolean; children: React.ReactNode }) {
  return (
    <section className="rp-page">
      <div className={first ? 'rp-body rp-first' : 'rp-body'}>{children}</div>
    </section>
  );
}

const tint = (i: number): Row['tone'] => (i % 2 ? 'rp-tint' : undefined);

const W = {
  cover: ['w-[169.8pt]', 'w-[325pt]'],
  meetings: ['w-[64.8pt]', 'w-[80pt]', 'w-[75pt]', 'w-[165.5pt]', 'w-[109.5pt]'],
  activities: ['w-[99.8pt]', 'w-[65pt]', 'w-[80pt]', 'w-[90.5pt]', 'w-[85pt]', 'w-[74.5pt]'],
  kpi: ['w-[195.3pt]', 'w-[100pt]', 'w-[100pt]', 'w-[99.5pt]'],
  partners: ['w-[119.3pt]', 'w-[61pt]', 'w-[110pt]', 'w-[63pt]', 'w-[144.5pt]'],
  summary: ['w-[344.8pt]', 'w-[150pt]'],
  incomes: ['w-[24.3pt]', 'w-[175.7pt]', 'w-[65.5pt]', 'w-[51.9pt]', 'w-[52.6pt]', 'w-[73.4pt]', 'w-[74.1pt]'],
  categories: ['w-[27.2pt]', 'w-[120.2pt]', 'w-[51.2pt]', 'w-[66.4pt]', 'w-[29.3pt]', 'w-[149.7pt]', 'w-[69.2pt]'],
  log: ['w-[60.3pt]', 'w-[75.7pt]', 'w-[90pt]', 'w-[80pt]', 'w-[54.6pt]', 'w-[69.8pt]', 'w-[65.4pt]'],
  signatures: ['w-[149.6pt]', 'w-[140.7pt]', 'w-[110pt]', 'w-[95pt]'],
};

const INCOME_HEAD = ['#', 'المصدر', 'المبلغ', 'العملة', 'الإجمالي', 'ملاحظات', 'رقم المستند / الإيصال'];
const LOG_HEAD = ['التاريخ', 'رقم المستند / الإيصال', 'البيان', 'الجهة المستفيدة', 'المبلغ', 'مرتبط بنشاط', 'معتمد من'];

export function FinancialReport({ report, preparedOn, includePending }: { report: Report; preparedOn: Date; includePending: boolean }) {
  const { incomes, expenses, categories } = report;

  const incomeRow = (entry: Report['incomes'][number] | null, index: number): Row => ({
    tone: tint(index),
    cells: entry
      ? [
          indic(index + 1),
          entry.organization?.name ?? entry.counterparty,
          amountOnly(entry.amount, entry.currency),
          entry.currency,
          null,
          small(entry.description),
          small(entry.documentNumber),
        ]
      : [indic(index + 1), null, null, null, null, null, null],
  });
  const incomeTotals: Row[] = [
    { tone: 'rp-total', cells: [null, <><b>الإجمالي</b> بالشيكل</>, null, null, strong(report.totalIncoming.ILS ? amountOnly(report.totalIncoming.ILS, 'ILS') : null), null, null] },
    { tone: 'rp-total', cells: [null, <><b>الإجمالي</b> بالدولار</>, null, null, strong(report.totalIncoming.USD ? amountOnly(report.totalIncoming.USD, 'USD') : null), null, null] },
  ];
  // أكثر من عشرة واردات تنفرد بصفحاتها؛ وإلا فالجدولان معًا كما في النموذج
  const incomesFit = incomes.length <= INCOME_ROWS;
  const incomeChunks = incomesFit ? [] : chunk(incomes, LOG_ROWS_PER_PAGE);
  const incomesTable = (rows: Row[], continued: boolean) => (
    <>
      <Sub>٣٫٢ تفصيل الإيرادات{continued ? ' (تابع)' : ''}</Sub>
      <Grid widths={W.incomes} head={INCOME_HEAD} tallHead rows={rows} />
    </>
  );

  const categoryRows: Row[] = [
    ...pad(categories, CATEGORY_ROWS).map((c, i): Row => ({
      tone: tint(i),
      cells: [indic(i + 1), c?.name, null, c ? moneyLine(c.actual) : null, null, '%', null],
    })),
    { tone: 'rp-total', cells: [null, strong('الإجمالي'), null, strong(moneyLine(report.totalOutgoing)), null, strong('%'), null] },
  ];
  const categoriesTable = (
    <>
      <Sub className="rp-gap">٣٫٣ تفصيل المصروفات</Sub>
      <Grid
        widths={W.categories}
        head={['', 'بند المصروف', 'المبلغ المخطط', 'المبلغ الفعلي', 'الفرق', 'نسبة الصرف من الموازنة', 'رقم المستند / الإيصال']}
        tallHead
        rows={categoryRows}
      />
    </>
  );

  const logChunks = chunk(expenses, LOG_ROWS_PER_PAGE);

  return (
    <div className="rp-root" dir="rtl">
      <Page first>
        <h2 className="rp-title">التقرير الإداري والمالي للمجلس الشبابي البلدي - رفح</h2>
        <div className="rp-rule" />
        <Grid
          widths={W.cover}
          head={['البيانات الأساسية', 'التفاصيل']}
          rows={[
            { tone: 'rp-tint', cells: [label('الفترة التي يغطيها التقرير'), `من ${reportDate(report.period.from)} إلى ${reportDate(report.period.to)}`] },
            { cells: [label('تاريخ إعداد التقرير'), reportDate(preparedOn)] },
            { tone: 'rp-tint', cells: [label('إعداد'), `${DOTS} (أمين السر / أمين الصندوق)`] },
            { tone: 'rp-tall', cells: [label('اعتماد'), <span key="sign" className="ms-[72pt]">(رئيس المجلس)</span>] },
          ]}
        />
        <Bar className="rp-gap-lg">١. الملخص التنفيذي</Bar>
        <p className="rp-lead">يُكتب في نصف صفحة كحد أقصى، ويتضمن:</p>
        <ul className="rp-list">
          <li>أبرز الإنجازات خلال الفترة.</li>
          <li>
            إجمالي الإيرادات والمصروفات والرصيد الحالي: الإيرادات {moneyLine(report.totalIncoming) || '—'}، المصروفات {moneyLine(report.totalOutgoing) || '—'}، الرصيد{' '}
            {moneyLine(report.closing) || '—'}.
          </li>
          <li>أهم التحديات والتوصيات.</li>
        </ul>
        {includePending ? <p className="rp-lead font-bold">تنبيه: تشمل هذه النسخة قيودًا لم تُعتمد بعد.</p> : null}
      </Page>

      <Page>
        <Bar>٢. التقرير الإداري</Bar>
        <Sub>٢٫١ الاجتماعات والقرارات</Sub>
        <Grid
          widths={W.meetings}
          head={['رقم الاجتماع', 'التاريخ', 'نسبة الحضور', 'أبرز القرارات', 'حالة التنفيذ']}
          rows={[1, 2, 3, 4, 5].map((n) => ({
            tone: n > 1 ? 'rp-tint' : undefined,
            cells: [indic(n), null, n < 3 ? '%' : null, null, n === 1 ? 'منفذ / قيد التنفيذ / مؤجل' : null],
          }))}
        />
        <Sub className="rp-gap-lg">٢٫٢ الأنشطة والفعاليات المنفذة</Sub>
        <Grid
          widths={W.activities}
          head={['الفعالية', 'التاريخ', 'اللجنة المسؤولة', 'عدد المستفيدين / المشاركين', 'الهدف المرتبط', 'مستوى الإنجاز']}
          tallHead
          rows={Array.from({ length: 18 }, (_, i) => ({ tone: i ? 'rp-tint' : undefined, cells: [null, null, null, null, null, null] }))}
        />
      </Page>

      <Page>
        <Sub>٢٫٣ مؤشرات الأداء الرئيسية</Sub>
        <Grid
          widths={W.kpi}
          head={['المؤشر', 'المستهدف', 'المتحقق', 'نسبة الإنجاز']}
          rows={['عدد الأنشطة المنفذة', 'عدد المشاركين الإجمالي', 'نسبة حضور الاجتماعات', 'عدد الشراكات المنعقدة'].map((k, i) => ({
            tone: i === 1 ? 'rp-tint' : undefined,
            cells: [label(k), null, null, '%'],
          }))}
        />
        <Sub className="rp-gap-lg">٢٫٤ الشراكات والتعاون الخارجي</Sub>
        <Grid
          widths={W.partners}
          head={['الجهة الشريكة', 'نوع الشراكة', 'طبيعة الدعم (مالي / عيني / فني)', 'القيمة', 'مدة الشراكة']}
          tallHead
          rows={Array.from({ length: 5 }, () => ({ cells: [null, null, null, null, null] }))}
        />
        <Bar className="rp-gap-lg">٣. التقرير المالي</Bar>
        <Sub>٣٫١ ملخص الوضع المالي</Sub>
        <Grid
          widths={W.summary}
          head={['البند', 'المبلغ']}
          rows={[
            { cells: [label('الرصيد الافتتاحي (بداية الفترة)'), moneyLine(report.opening)] },
            { tone: 'rp-tint', cells: [label('إجمالي الإيرادات'), moneyLine(report.totalIncoming)] },
            { cells: [label('إجمالي المصروفات'), moneyLine(report.totalOutgoing)] },
            { tone: 'rp-total', cells: [label('الإجمالي: الرصيد الختامي (الرصيد الافتتاحي + الإيرادات − المصروفات)'), strong(moneyLine(report.closing))] },
          ]}
        />
      </Page>

      {incomesFit ? (
        <Page>
          {incomesTable([...pad(incomes, INCOME_ROWS).map(incomeRow), ...incomeTotals], false)}
          {categories.length <= CATEGORY_ROWS ? categoriesTable : null}
        </Page>
      ) : (
        incomeChunks.map((rows, p) => {
          const offset = p * LOG_ROWS_PER_PAGE;
          const body = rows.map((entry, i) => incomeRow(entry, offset + i));
          return <Page key={p}>{incomesTable(p === incomeChunks.length - 1 ? [...body, ...incomeTotals] : body, p > 0)}</Page>;
        })
      )}
      {!incomesFit || categories.length > CATEGORY_ROWS ? <Page>{categoriesTable}</Page> : null}

      {logChunks.map((rows, p) => (
        <Page key={p}>
          <Sub>٣٫٤ سجل الصرف التفصيلي{p > 0 ? ' (تابع)' : ''}</Sub>
          <Grid
            widths={W.log}
            head={LOG_HEAD}
            tallHead
            rows={(logChunks.length === 1 ? pad(rows, LOG_ROWS_PER_PAGE) : rows).map((e) => ({
              cells: e
                ? [
                    reportDate(e.occurredAt),
                    small(e.documentNumber),
                    small(e.description),
                    small(e.counterparty ?? e.organization?.name),
                    money(e.amount, e.currency),
                    small(e.initiative?.title),
                    small(e.approvedBy?.fullName),
                  ]
                : [null, null, null, null, null, null, null],
            }))}
          />
          {p === logChunks.length - 1 ? (
            <>
              <Bar className="rp-gap-lg">٤. الاحتياجات</Bar>
              <ul className="rp-list rp-list-sm">
                <li>{DOTS}</li>
                <li>{DOTS}</li>
              </ul>
            </>
          ) : null}
        </Page>
      ))}

      <Page>
        <Bar>٥. التوصيات</Bar>
        <ol className="rp-list rp-list-sm rp-numbered">
          <li>{DOTS}</li>
          <li>{DOTS}</li>
          <li>{DOTS}</li>
        </ol>
        <Bar className="rp-gap-lg">٦. الملاحق (تُرفق مع التقرير)</Bar>
        <ul className="rp-list">
          <li>صور الفواتير والإيصالات.</li>
          <li>محاضر الاجتماعات.</li>
          <li>صور الفعاليات وتقارير الأنشطة.</li>
          <li>كشف الصندوق.</li>
        </ul>
        <Bar className="rp-gap-lg">٧. الإقرار والتوقيعات</Bar>
        <p className="rp-declaration">نقر بأن البيانات الواردة في هذا التقرير صحيحة ومطابقة للمستندات المؤيدة.</p>
        <Grid
          widths={W.signatures}
          head={['الصفة', 'الاسم', 'التوقيع', 'التاريخ']}
          rows={[
            { cells: [label('أمين الصندوق'), null, null, null] },
            { tone: 'rp-tint', cells: [label('أمين السر'), null, null, null] },
            { cells: [label('رئيس المجلس'), null, null, null] },
          ]}
        />
      </Page>
    </div>
  );
}
