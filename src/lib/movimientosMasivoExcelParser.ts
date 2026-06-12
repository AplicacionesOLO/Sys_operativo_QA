import * as XLSX from 'xlsx';

export interface MasivoParseResult {
  headers: string[];
  previewRows: Record<string, unknown>[];
  batches: Record<string, unknown>[][];
  totalRows: number;
  errors: string[];
}

function cellValue(val: unknown): string | number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  const str = String(val).trim();
  return str.length === 0 ? null : str;
}

function normalizeHeader(raw: unknown): string {
  return String(raw ?? '').trim();
}

const BATCH_SIZE = 1000;

export function parseMovimientosMasivoExcel(buffer: ArrayBuffer): MasivoParseResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  } catch {
    return { headers: [], previewRows: [], batches: [], totalRows: 0, errors: ['El archivo no pudo leerse como Excel. Verifica que sea .xlsx o .xls.'] };
  }

  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });

  if (aoa.length < 2) {
    return { headers: [], previewRows: [], batches: [], totalRows: 0, errors: ['El archivo no tiene suficientes filas.'] };
  }

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const row = aoa[i];
    if (!Array.isArray(row)) continue;
    if (row.filter(c => cellValue(c) !== null).length >= 2) { headerRowIdx = i; break; }
  }

  if (headerRowIdx === -1) {
    return { headers: [], previewRows: [], batches: [], totalRows: 0, errors: ['No se encontró una fila de encabezados.'] };
  }

  const headerRow = aoa[headerRowIdx];
  const headers: string[] = [];
  const headerCounts = new Map<string, number>();

  for (let i = 0; i < headerRow.length; i++) {
    let h = normalizeHeader(headerRow[i]);
    if (!h) h = `Columna_${i + 1}`;
    if (headerCounts.has(h)) {
      const cnt = headerCounts.get(h)! + 1;
      headerCounts.set(h, cnt);
      h = `${h}_${cnt}`;
    } else {
      headerCounts.set(h, 1);
    }
    headers.push(h);
  }

  if (headers.length < 1) {
    return { headers: [], previewRows: [], batches: [], totalRows: 0, errors: ['No se detectaron columnas.'] };
  }

  const batches: Record<string, unknown>[][] = [];
  let currentBatch: Record<string, unknown>[] = [];
  let totalRows = 0;

  for (let i = headerRowIdx + 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!Array.isArray(row)) continue;
    if (!row.some(c => cellValue(c) !== null)) continue;

    const obj: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = cellValue(row[j]);
    }
    currentBatch.push(obj);
    if (currentBatch.length >= BATCH_SIZE) { batches.push(currentBatch); currentBatch = []; }
    totalRows++;
  }

  if (currentBatch.length > 0) batches.push(currentBatch);
  const previewRows = batches.length > 0 ? batches[0].slice(0, 10) : [];
  return { headers, previewRows, batches, totalRows, errors: [] };
}
