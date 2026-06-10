import * as XLSX from 'xlsx';
import type { EmpleadoParsed, EmpleadosParseResult } from '@/types/mano_obra_empleados';

// ── Column aliases (normalised lowercase → field key) ────────────────────────
const COLUMN_MAP: Record<string, keyof Omit<EmpleadoParsed, 'errors' | 'rowIndex'>> = {
  'departamento':       'departamento',
  'puesto descripcion': 'puesto_descripcion',
  'puesto descripción': 'puesto_descripcion',
  'puesto_descripcion': 'puesto_descripcion',
  'jefe inmediato':     'jefe_inmediato',
  'jefe_inmediato':     'jefe_inmediato',
  'seccion':            'seccion',
  'sección':            'seccion',
  'area':               'area',
  'área':               'area',
  'dist':               'dist',
  'empresa lab':        'empresa_lab',
  'empresa_lab':        'empresa_lab',
  'silo':               'silo',
  'tipo':               'tipo',
};

const REQUIRED_FIELDS: Array<keyof Omit<EmpleadoParsed, 'errors' | 'rowIndex'>> = [
  'departamento', 'puesto_descripcion', 'area', 'dist',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeKey(val: unknown): string {
  return String(val ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function str(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function parseDistValue(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const s = String(val).replace(/,/g, '.').replace(/[^0-9.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function isBlankRow(row: unknown[]): boolean {
  return !Array.isArray(row) || row.every(c => c === null || c === undefined || String(c).trim() === '');
}

// ── Find header row ──────────────────────────────────────────────────────────

function findHeaderRow(aoa: unknown[][]): { rowIdx: number; colMap: Record<number, keyof Omit<EmpleadoParsed, 'errors' | 'rowIndex'>> } | null {
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    const row = aoa[i];
    if (!Array.isArray(row)) continue;
    const mapped: Record<number, keyof Omit<EmpleadoParsed, 'errors' | 'rowIndex'>> = {};
    row.forEach((cell, j) => {
      const key = normalizeKey(cell);
      if (COLUMN_MAP[key]) mapped[j] = COLUMN_MAP[key];
    });
    // Need at least 5 recognized columns to confirm this is the header
    if (Object.keys(mapped).length >= 5) {
      return { rowIdx: i, colMap: mapped };
    }
  }
  return null;
}

// ── Parse a single data row ──────────────────────────────────────────────────

function parseDataRow(
  row: unknown[],
  colMap: Record<number, keyof Omit<EmpleadoParsed, 'errors' | 'rowIndex'>>,
  rowIndex: number,
): EmpleadoParsed {
  const partial: Partial<Omit<EmpleadoParsed, 'errors' | 'rowIndex'>> = {
    departamento: '',
    puesto_descripcion: '',
    jefe_inmediato: '',
    seccion: '',
    area: '',
    dist: 0,
    empresa_lab: '',
    silo: '',
    tipo: '',
  };

  Object.entries(colMap).forEach(([colIdxStr, field]) => {
    const colIdx = Number(colIdxStr);
    const raw = row[colIdx];
    if (field === 'dist') {
      partial.dist = parseDistValue(raw) ?? 0;
    } else {
      (partial as Record<string, string>)[field] = str(raw);
    }
  });

  const errors: string[] = [];

  REQUIRED_FIELDS.forEach(f => {
    if (f === 'dist') {
      const rawDist = Object.entries(colMap).find(([, v]) => v === 'dist');
      if (rawDist) {
        const parsed = parseDistValue(row[Number(rawDist[0])]);
        if (parsed === null) errors.push(`"Dist" no es un número válido`);
      }
    } else {
      if (!partial[f]) errors.push(`"${f}" está vacío`);
    }
  });

  return { ...(partial as Omit<EmpleadoParsed, 'errors' | 'rowIndex'>), errors, rowIndex };
}

// ── Main export ──────────────────────────────────────────────────────────────

export function parseEmpleadosFile(buffer: ArrayBuffer, fileName: string): EmpleadosParseResult {
  let aoa: unknown[][];

  try {
    const isCSV = /\.csv$/i.test(fileName);
    const wb = XLSX.read(buffer, {
      type: 'array',
      raw: true,
      cellDates: false,
      ...(isCSV ? { type: 'array' } : {}),
    });
    const ws = wb.Sheets[wb.SheetNames[0]];
    aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });
  } catch {
    return {
      rows: [],
      totalRows: 0,
      validRows: 0,
      errorRows: 0,
      errors: ['No se pudo leer el archivo. Verifica que sea .xlsx, .xls o .csv válido.'],
    };
  }

  const headerInfo = findHeaderRow(aoa);
  if (!headerInfo) {
    return {
      rows: [],
      totalRows: 0,
      validRows: 0,
      errorRows: 0,
      errors: [
        'No se encontró la fila de encabezado. Verifica que el archivo tenga las columnas: ' +
        'Departamento, Puesto Descripción, Jefe Inmediato, Sección, Área, Dist, Empresa Lab, Silo, Tipo',
      ],
    };
  }

  const { rowIdx, colMap } = headerInfo;
  const dataRows = aoa.slice(rowIdx + 1);
  const parsed: EmpleadoParsed[] = [];

  dataRows.forEach((row, i) => {
    if (!Array.isArray(row) || isBlankRow(row)) return;
    parsed.push(parseDataRow(row, colMap, rowIdx + i + 2)); // +2 = 1-based + header row
  });

  const validRows = parsed.filter(r => r.errors.length === 0).length;
  const errorRows = parsed.filter(r => r.errors.length > 0).length;

  return {
    rows: parsed,
    totalRows: parsed.length,
    validRows,
    errorRows,
    errors: [],
  };
}
