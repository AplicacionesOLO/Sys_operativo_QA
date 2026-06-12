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

const BATCH_SIZE = 1000;

export function parseSlotsExcel(buffer: ArrayBuffer): MasivoParseResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  } catch {
    return { headers: [], previewRows: [], batches: [], totalRows: 0, errors: ['El archivo no pudo leerse como Excel.'] };
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });

  if (aoa.length < 2) {
    return { headers: [], previewRows: [], batches: [], totalRows: 0, errors: ['El archivo necesita al menos una fila de encabezado y una de datos.'] };
  }

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const row = aoa[i];
    if (Array.isArray(row) && row.filter(c => cellValue(c) !== null).length >= 2) { headerRowIdx = i; break; }
  }
  if (headerRowIdx === -1) return { headers: [], previewRows: [], batches: [], totalRows: 0, errors: ['No se encontró fila de encabezados.'] };

  const headerRow = aoa[headerRowIdx] as unknown[];
  const headers: string[] = [];
  const counts = new Map<string, number>();
  for (let i = 0; i < headerRow.length; i++) {
    let h = String(headerRow[i] ?? '').trim() || `Columna_${i + 1}`;
    if (counts.has(h)) { const n = counts.get(h)! + 1; counts.set(h, n); h = `${h}_${n}`; } else counts.set(h, 1);
    headers.push(h);
  }

  const batches: Record<string, unknown>[][] = [];
  let current: Record<string, unknown>[] = [];
  let totalRows = 0;
  for (let i = headerRowIdx + 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!Array.isArray(row) || !row.some(c => cellValue(c) !== null)) continue;
    const obj: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = cellValue(row[j]);
    current.push(obj);
    if (current.length >= BATCH_SIZE) { batches.push(current); current = []; }
    totalRows++;
  }
  if (current.length > 0) batches.push(current);
  return { headers, previewRows: batches[0]?.slice(0, 10) ?? [], batches, totalRows, errors: [] };
}

/** Extract unique {mes, anio} pairs from Fecha Situación column */
export function extractMonthYears(batches: Record<string, unknown>[][]): { mes: number; anio: number }[] {
  const seen = new Map<string, { mes: number; anio: number }>();
  for (const batch of batches) {
    for (const row of batch) {
      const raw = row['Fecha Situación'];
      if (!raw) continue;
      const str = String(raw).trim();
      let m = str.match(/^(\d{4})-(\d{1,2})/);
      if (m) { const key = `${m[1]}-${m[2]}`; if (!seen.has(key)) seen.set(key, { anio: parseInt(m[1]), mes: parseInt(m[2]) }); continue; }
      m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (m) { const d1 = parseInt(m[1]), d2 = parseInt(m[2]), y = parseInt(m[3]); const mes = d1 > 12 ? d2 : d1; const key = `${y}-${mes}`; if (!seen.has(key)) seen.set(key, { anio: y, mes }); }
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes);
}

export const SLOTS_KEY_COLUMNS = ['Zona Almacenaje','Ubicación','Id Almacenamiento','Estado','Tipo Ubicación','Dimensión'];
