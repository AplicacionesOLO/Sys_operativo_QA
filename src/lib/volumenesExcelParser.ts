import * as XLSX from 'xlsx';
import type { ExcelClientRow, ExcelParseResult } from '@/types/volumenes';

// ---------------------------------------------------------------------------
// Helpers — numbers / strings
// ---------------------------------------------------------------------------

function parseNum(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val)
    .replace(/[%$\s]/g, '')
    // Remove thousands-separator dots (1.234.567 → 1234567) but preserve decimal comma
    .replace(/\.(?=\d{3}(?:[,.]|$))/g, '')
    .replace(',', '.');
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function cellStr(val: unknown): string {
  return String(val ?? '').trim();
}

function cellContains(val: unknown, keyword: string): boolean {
  return cellStr(val).toLowerCase().includes(keyword.toLowerCase());
}

// ---------------------------------------------------------------------------
// Excel serial date → "YYYY-MM"
// Excel's epoch: Jan 1 1900 = serial 1 (with the historical off-by-2 bug)
// ---------------------------------------------------------------------------

function excelSerialToMonthId(serial: number): string {
  // Offset: 25569 = days between 1900-01-01 and 1970-01-01 (adjusting for Excel's leap year bug)
  const msPerDay = 86400 * 1000;
  const d = new Date((serial - 25569) * msPerDay);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** Short month abbreviations for display */
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2025-01" → "Jan 25" */
export function monthIdToLabel(id: string): string {
  const m = id.match(/^(\d{4})-(\d{2})$/);
  if (!m) return id;
  const year = parseInt(m[1]);
  const monthIdx = parseInt(m[2]) - 1;
  const abbr = MONTH_ABBR[monthIdx] ?? id;
  return `${abbr} ${String(year).slice(2)}`;
}

/**
 * Normaliza la etiqueta de un mes:
 * - Si es número → Excel serial → "YYYY-MM"
 * - Si es string tipo "Jan-", "Feb-24", "Ene 2025" → "YYYY-MM" o slug limpio
 */
export function normalizeMonthLabel(val: unknown): string {
  if (val === null || val === undefined) return '';

  // Number → Excel date serial
  if (typeof val === 'number') {
    if (val > 0) return excelSerialToMonthId(val);
    return '';
  }

  const raw = String(val).trim();
  if (!raw) return '';

  // Already in YYYY-MM format
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;

  // Try to parse "MMM-YY", "MMM-YYYY", "MMM YYYY", "MMM-", "MMM"
  const monthMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    // Spanish abbreviations
    ene: '01', abr: '04', ago: '08',
  };

  const clean = raw.toLowerCase().replace(/[-_/\s]+/g, ' ').trim();
  const parts = clean.split(' ').filter(Boolean);

  if (parts.length >= 1) {
    const key = parts[0].substring(0, 3);
    if (monthMap[key]) {
      const mm = monthMap[key];
      const yearStr = parts[1] ? parts[1].replace(/\D/g, '') : '';
      if (yearStr.length === 4) return `${yearStr}-${mm}`;
      if (yearStr.length === 2) {
        const century = parseInt(yearStr) >= 50 ? 19 : 20;
        return `${century}${yearStr}-${mm}`;
      }
      // No year in label → return cleaned string without trailing dash
      return raw.replace(/-+$/, '').trim();
    }
  }

  // Fallback: return cleaned original
  return raw.replace(/-+$/, '').trim();
}

// ---------------------------------------------------------------------------
// Find block rows
// ---------------------------------------------------------------------------

function findBlockRow(aoa: unknown[][], keyword: string): number {
  for (let i = 0; i < aoa.length; i++) {
    const row = aoa[i];
    if (!Array.isArray(row)) continue;
    if (cellContains(row[0], keyword)) return i;
  }
  return -1;
}

function isBlankRow(row: unknown[]): boolean {
  return !Array.isArray(row) || row.every(c => c === null || c === undefined || cellStr(c) === '');
}

// ---------------------------------------------------------------------------
// Build column map from a header row (cols B+)
// Returns { meses, mesColIndexes } — already normalised
// ---------------------------------------------------------------------------

interface ColMap {
  meses: string[];          // normalised month IDs/labels, in order
  mesColIndexes: number[];  // column indexes in the sheet row
}

function buildColMap(headerRow: unknown[]): ColMap {
  const meses: string[] = [];
  const mesColIndexes: number[] = [];

  for (let j = 1; j < headerRow.length; j++) {
    const val = headerRow[j];
    if (val === null || val === undefined) continue;
    const label = normalizeMonthLabel(val);
    if (label) {
      meses.push(label);
      mesColIndexes.push(j);
    }
  }

  return { meses, mesColIndexes };
}

// ---------------------------------------------------------------------------
// Parse one block
// blockRow     = index of "Uds recibidas" / "Uds Despachadas" row
// endRow       = exclusive end index
// fallbackCols = use these column indexes+meses if the block row has no months
// ---------------------------------------------------------------------------

interface ParsedBlock {
  clientes: ExcelClientRow[];
  totalRow: ExcelClientRow | null;
  meses: string[];
}

function parseBlock(
  aoa: unknown[][],
  blockRow: number,
  endRow: number,
  fallbackCols?: ColMap,
): ParsedBlock {
  const headerRow = aoa[blockRow] ?? [];

  // Try to get column map from the block header row itself
  let colMap = buildColMap(headerRow);

  // If block header has no month columns, fall back to recibidas column map
  if (colMap.meses.length === 0 && fallbackCols && fallbackCols.meses.length > 0) {
    colMap = fallbackCols;
  }

  const { meses, mesColIndexes } = colMap;
  const clientes: ExcelClientRow[] = [];
  let totalRow: ExcelClientRow | null = null;

  for (let i = blockRow + 1; i < endRow && i < aoa.length; i++) {
    const row = aoa[i];
    if (!Array.isArray(row) || isBlankRow(row)) continue;

    const clienteName = cellStr(row[0]);
    if (!clienteName) continue;

    // Stop if we hit another block header
    if (
      cellContains(row[0], 'uds recibidas') ||
      cellContains(row[0], 'uds despachadas')
    ) break;

    const mesesValues: Record<string, number> = {};
    let rowTotal = 0;

    mesColIndexes.forEach((colIdx, idx) => {
      const raw = row[colIdx];
      // Skip truly empty / null cells — don't store the key at all
      if (raw === null || raw === undefined || String(raw).trim() === '') return;
      const v = parseNum(raw);
      mesesValues[meses[idx]] = v;
      rowTotal += v;
    });

    const entry: ExcelClientRow = {
      cliente: clienteName,
      meses: mesesValues,
      total: rowTotal,
    };

    const isTotal =
      clienteName.toLowerCase() === 'total' ||
      clienteName.toLowerCase().startsWith('total ');

    if (isTotal) {
      totalRow = entry;
    } else {
      clientes.push(entry);
    }
  }

  return { clientes, totalRow, meses };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function parseVolumenesExcel(buffer: ArrayBuffer): ExcelParseResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  } catch {
    return {
      recibidas: [],
      despachadas: [],
      meses: [],
      clientes: [],
      totalInOut: null,
      errors: ['El archivo no pudo leerse como Excel. Verifica que sea .xlsx o .xls.'],
    };
  }

  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });

  const recibidasRow   = findBlockRow(aoa, 'uds recibidas');
  const despachadasRow = findBlockRow(aoa, 'uds despachadas');
  const totalInOutRow  = findBlockRow(aoa, 'total in/out');

  const errors: string[] = [];
  if (recibidasRow === -1)
    errors.push('No se encontró la fila "Uds recibidas" en la columna A del Excel.');
  if (despachadasRow === -1)
    errors.push('No se encontró la fila "Uds Despachadas" en la columna A del Excel.');

  if (errors.length > 0) {
    return { recibidas: [], despachadas: [], meses: [], clientes: [], totalInOut: null, errors };
  }

  const recibidasEnd   = despachadasRow > recibidasRow ? despachadasRow : aoa.length;
  const despachadasEnd = totalInOutRow > despachadasRow ? totalInOutRow : aoa.length;

  // Parse recibidas first — its column map is the reference
  const recResult = parseBlock(aoa, recibidasRow, recibidasEnd);

  // Build fallback ColMap from recibidas header (in case despachadas header has no months)
  const recHeaderRow = aoa[recibidasRow] ?? [];
  const recColMap = buildColMap(recHeaderRow);

  // Parse despachadas, passing recibidas column map as fallback
  const desResult = parseBlock(aoa, despachadasRow, despachadasEnd, recColMap);

  // Parse "Total in/out" row
  let totalInOut: ExcelClientRow | null = null;
  if (totalInOutRow >= 0) {
    const tiRow = aoa[totalInOutRow] ?? [];
    const refMeses = recResult.meses.length > 0 ? recResult.meses : desResult.meses;
    const { mesColIndexes } = recColMap;

    const mesesValues: Record<string, number> = {};
    let rowTotal = 0;
    mesColIndexes.forEach((colIdx, idx) => {
      const raw = tiRow[colIdx];
      if (raw === null || raw === undefined || String(raw).trim() === '') return;
      const v = parseNum(raw);
      mesesValues[refMeses[idx]] = v;
      rowTotal += v;
    });
    totalInOut = { cliente: 'Total in/out', meses: mesesValues, total: rowTotal };
  }

  // Merge month lists
  const allMeses = [
    ...recResult.meses,
    ...desResult.meses.filter(m => !recResult.meses.includes(m)),
  ];

  // Merge client lists
  const recClientNames = recResult.clientes.map(c => c.cliente);
  const desClientNames = desResult.clientes.map(c => c.cliente)
    .filter(c => !recClientNames.includes(c));
  const allClientes = [...recClientNames, ...desClientNames];

  if (recResult.clientes.length === 0)
    errors.push('El bloque "Uds recibidas" no tiene filas de clientes.');
  if (desResult.clientes.length === 0)
    errors.push('El bloque "Uds Despachadas" no tiene filas de clientes.');
  if (allMeses.length === 0)
    errors.push('No se detectaron columnas de meses en el archivo.');

  return {
    recibidas:   recResult.clientes,
    despachadas: desResult.clientes,
    meses:       allMeses,
    clientes:    allClientes,
    totalInOut,
    errors,
  };
}
