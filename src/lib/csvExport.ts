import * as XLSX from 'xlsx';

/**
 * CSV / Excel export helpers.
 */

function escapeCsv(value: string | number | undefined | null): string {
  const str = String(value ?? '');
  if (/[,"\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | undefined | null)[][],
): void {
  const csv = [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => row.map(escapeCsv).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadExcel(
  filename: string,
  headers: string[],
  rows: (string | number | undefined | null)[][],
): void {
  const data: (string | number | undefined | null)[][] = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, filename);
}

export interface ExcelSheet {
  name: string;
  headers: string[];
  rows: (string | number | undefined | null)[][];
}

/** Multi-sheet Excel export — Sheet 1: data, Sheet 2+: optional formula details */
export function downloadExcelMultiSheet(
  filename: string,
  sheets: ExcelSheet[],
): void {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const data: (string | number | undefined | null)[][] = [sheet.headers, ...sheet.rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    // Auto column widths
    const colWidths = sheet.headers.map((h, ci) => {
      const maxContent = Math.max(
        h.length,
        ...sheet.rows.map(row => String(row[ci] ?? '').length),
      );
      return { wch: Math.min(Math.max(maxContent + 2, 8), 60) };
    });
    ws['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31)); // Excel sheet name max 31 chars
  }
  XLSX.writeFile(wb, filename);
}