import 'server-only';
import ExcelJS from 'exceljs';

// XLSX على الخادم فقط (S5-3 — exceljs). كل ورقة من اليمين لليسار، بصف عناوين مثبّت ومرشّح.
// الأعمدة تُمرَّر صراحةً: لا يُصدَّر حقل لم يُذكر هنا (قيد «نفس حقول الواجهة»).

export type Cell = string | number | Date | null;
export type SheetSpec = {
  name: string;
  columns: { header: string; key: string; width?: number; numFmt?: string }[];
  rows: Record<string, Cell>[];
};

export async function buildWorkbook(sheets: SheetSpec[], title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'نبض رفح';
  wb.title = title;
  wb.created = new Date();
  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name.slice(0, 31), {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    });
    ws.columns = spec.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18, style: c.numFmt ? { numFmt: c.numFmt } : {} }));
    ws.getRow(1).font = { bold: true };
    ws.addRows(spec.rows);
    if (spec.rows.length > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.columns.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
