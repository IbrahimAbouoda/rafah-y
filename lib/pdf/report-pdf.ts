import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as fontkit from 'fontkit';
import pdfmake, { type Content } from 'pdfmake';
import { formatMetric, formatTarget, METRIC_KEYS, METRICS, type MetricsSnapshot } from '@/lib/reports/metrics';
import { formatTrendValue } from '@/lib/reports/format';
import { pdfLines } from './arabic';

// PDF التقرير الرسمي (D14) من اللقطة المحفوظة نفسها — لا أرقام حيّة. الخط IBM Plex Sans Arabic (خط الواجهة، OFL)
// محفوظ في lib/pdf/fonts، ويُقاس به الالتفاف بـ fontkit فتطابق الأسطر ما يرسمه pdfkit (lib/pdf/arabic.ts).

const FONT_DIR = path.join(process.cwd(), 'lib', 'pdf', 'fonts');
const FACES = { normal: 'IBMPlexSansArabic-Regular.woff', bold: 'IBMPlexSansArabic-Bold.woff' } as const;

type Face = keyof typeof FACES;
let fonts: Record<Face, fontkit.Font> | null = null;

/** يسجّل الخط في pdfmake مرة لكل عملية، ويمنع أي قراءة لملف محلي أو رابط من داخل المستند */
function loadFonts(): Record<Face, fontkit.Font> {
  if (fonts) return fonts;
  const buffers = { normal: readFileSync(path.join(FONT_DIR, FACES.normal)), bold: readFileSync(path.join(FONT_DIR, FACES.bold)) };
  pdfmake.virtualfs.writeFileSync(FACES.normal, buffers.normal);
  pdfmake.virtualfs.writeFileSync(FACES.bold, buffers.bold);
  pdfmake.addFonts({ Plex: { normal: FACES.normal, bold: FACES.bold, italics: FACES.normal, bolditalics: FACES.bold } });
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy(() => false);
  fonts = { normal: fontkit.create(buffers.normal), bold: fontkit.create(buffers.bold) };
  return fonts;
}

const PAGE = { width: 595.28, margin: 40 };
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;
/** حشوة الخلية الافتراضية في جداول pdfmake (4 يمينًا و 4 يسارًا) وهامش أمان للتقريب */
const CELL_PADDING = 10;

/** فقرة عربية بعرض محدد: أسطر ملتفة مسبقًا، كل سطر محاذى يمينًا */
function rtl(text: string, width: number, opts: { size?: number; bold?: boolean; color?: string } = {}): Content {
  const size = opts.size ?? 10;
  const font = loadFonts()[opts.bold ? 'bold' : 'normal'];
  const measure = (shaped: string) => (font.layout(shaped).advanceWidth * size) / font.unitsPerEm;
  return {
    stack: pdfLines(text, width, measure).map((line) => ({ text: line.map((t) => ({ text: t })), alignment: 'right' })),
    fontSize: size,
    bold: opts.bold ?? false,
    ...(opts.color ? { color: opts.color } : {}),
  };
}

/** جدول بأعمدة يمين ← يسار: يُعطى بترتيب القراءة ويُقلب لأن pdfmake يرسم الجداول يسارًا ← يمينًا */
function rtlTable(widths: number[], header: string[], rows: string[][]): Content {
  const cells = (row: string[], bold: boolean) => row.map((v, i) => rtl(v, widths[i]! - CELL_PADDING, { size: 9, bold })).reverse();
  return {
    table: {
      headerRows: 1,
      widths: [...widths].reverse(),
      body: [cells(header, true), ...rows.map((r) => cells(r, false))],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => '#d9d4c7',
      vLineColor: () => '#d9d4c7',
      fillColor: (row: number) => (row === 0 ? '#e6f0ed' : null),
    },
    margin: [0, 4, 0, 14],
  };
}

export type ReportPdfInput = {
  title: string;
  periodLabel: string;
  snapshot: MetricsSnapshot;
  summary: string | null;
  status: string;
  generatedAt: string;
};

export async function buildReportPdf(input: ReportPdfInput): Promise<Buffer> {
  loadFonts();
  const { snapshot } = input;
  const metricsRows = METRIC_KEYS.map((k) => [
    `${k} · ${METRICS[k].label}`,
    METRICS[k].definition,
    formatMetric(k, snapshot.values[k]) ?? (METRICS[k].pending ? 'لم يُفعَّل بعد' : 'لا بيانات'),
    formatTarget(k),
  ]);
  const trendRows = snapshot.trend.map((p) => [
    p.month,
    formatTrendValue(p.complaints, 'count'),
    formatTrendValue(p.triageMedianHours, 'hours'),
    formatTrendValue(p.closureRate, 'ratio'),
  ]);

  const content: Content[] = [
    rtl('نبض رفح — المجلس البلدي الشبابي في رفح', CONTENT_WIDTH, { size: 9, color: '#0b5c4b' }),
    { ...(rtl(input.title, CONTENT_WIDTH, { size: 17, bold: true }) as object), margin: [0, 6, 0, 2] },
    rtl(`${input.periodLabel} · ${snapshot.from} ← ${snapshot.to} · ${input.status}`, CONTENT_WIDTH, { size: 10, color: '#5d6560' }),
    rtl(`الأرقام لقطة محفوظة وقت إعداد التقرير (${input.generatedAt})، ولا تتغيّر بتغيّر البيانات بعده.`, CONTENT_WIDTH, {
      size: 9,
      color: '#5d6560',
    }),
  ];
  if (input.summary) {
    content.push({ ...(rtl('ملخص المجلس', CONTENT_WIDTH, { size: 12, bold: true }) as object), margin: [0, 14, 0, 4] });
    content.push(rtl(input.summary, CONTENT_WIDTH, { size: 10 }));
  }
  content.push({ ...(rtl('مؤشرات النجاح', CONTENT_WIDTH, { size: 12, bold: true }) as object), margin: [0, 14, 0, 0] });
  content.push(rtl('الأهداف مقترحة في وثيقة المتطلبات ولم يُقرّها المجلس بعد.', CONTENT_WIDTH, { size: 8, color: '#5d6560' }));
  content.push(rtlTable([125, 225, 75, 90], ['المؤشر', 'التعريف', 'القيمة', 'الهدف المقترح'], metricsRows));
  content.push({ ...(rtl('الاتجاه الشهري', CONTENT_WIDTH, { size: 12, bold: true }) as object), margin: [0, 4, 0, 0] });
  content.push(rtlTable([95, 120, 160, 140], ['الشهر', 'الشكاوى', 'وسيط زمن الفرز', 'نسبة الإغلاق'], trendRows));

  return pdfmake
    .createPdf({
      pageSize: 'A4',
      pageMargins: [PAGE.margin, PAGE.margin, PAGE.margin, 50],
      info: { title: input.title, creator: 'نبض رفح' },
      defaultStyle: { font: 'Plex', fontSize: 10, lineHeight: 1.15 },
      footer: (page: number, pages: number) => ({
        text: pdfLines(`صفحة ${page} من ${pages}`, CONTENT_WIDTH, () => 0)[0]!.map((t) => ({ text: t })),
        alignment: 'center',
        fontSize: 8,
        color: '#5d6560',
        margin: [0, 18, 0, 0],
      }),
      content,
    })
    .getBuffer();
}
