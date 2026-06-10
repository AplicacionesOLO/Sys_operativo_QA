import * as XLSX from 'xlsx';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface MasivoParseResult {
  headers: string[];
  previewRows: Record<string, unknown>[];
  batches: Record<string, unknown>[][];
  totalRows: number;
  errors: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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

// ── Constants ───────────────────────────────────────────────────────────────

const BATCH_SIZE = 1000;

// Zone unification: these zones are automatically mapped to ZP15
const ZONE_UNIFICATION_MAP: Record<string, string> = {
  'ZP32': 'ZP15',
  'ZP44': 'ZP15',
  'ZP28': 'ZP15',
  'ZP20': 'ZP15',
};

const ZONE_PICKING_KEY = 'Zona Picking';
const ZONA_TRABAJO_RECURSO_KEY = 'Zona Trabajo Recurso';
const ZONA_ALMACENAJE_KEY = 'Zona Almacenaje';
const ZONA_COLA_PREP_KEY = 'Zona Cola Preparación';
const ZONA_TRABAJO_PREP_KEY = 'Zona Trabajo Preparación';

const ZONE_KEYS = [
  ZONE_PICKING_KEY,
  ZONA_TRABAJO_RECURSO_KEY,
  ZONA_ALMACENAJE_KEY,
  ZONA_COLA_PREP_KEY,
  ZONA_TRABAJO_PREP_KEY,
];

// ── Main parser ─────────────────────────────────────────────────────────────

export function parseVolumenesMasivoExcel(buffer: ArrayBuffer): MasivoParseResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  } catch {
    return {
      headers: [],
      previewRows: [],
      batches: [],
      totalRows: 0,
      errors: ['El archivo no pudo leerse como Excel. Verifica que sea .xlsx o .xls.'],
    };
  }

  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });

  if (aoa.length < 2) {
    return {
      headers: [],
      previewRows: [],
      batches: [],
      totalRows: 0,
      errors: ['El archivo no tiene suficientes filas. Se necesita al menos 1 fila de encabezado y 1 de datos.'],
    };
  }

  // Buscar fila de headers: la primera fila con al menos 2 celdas no vacías
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const row = aoa[i];
    if (!Array.isArray(row)) continue;
    const nonEmpty = row.filter(c => cellValue(c) !== null).length;
    if (nonEmpty >= 2) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    return {
      headers: [],
      previewRows: [],
      batches: [],
      totalRows: 0,
      errors: ['No se encontró una fila de encabezados con al menos 2 columnas.'],
    };
  }

  const headerRow = aoa[headerRowIdx];
  const headers: string[] = [];

  // Construir headers, evitando duplicados
  const headerCounts = new Map<string, number>();
  for (let i = 0; i < headerRow.length; i++) {
    let h = normalizeHeader(headerRow[i]);
    if (!h) {
      h = `Columna_${i + 1}`;
    }
    // Si ya existe, agregar sufijo numérico
    if (headerCounts.has(h)) {
      const cnt = headerCounts.get(h)! + 1;
      headerCounts.set(h, cnt);
      h = `${h}_${cnt}`;
    } else {
      headerCounts.set(h, 1);
    }
    headers.push(h);
  }

  // Si los headers son muy pocos, no procesar
  if (headers.length < 1) {
    return {
      headers: [],
      previewRows: [],
      batches: [],
      totalRows: 0,
      errors: ['No se detectaron columnas en el archivo.'],
    };
  }

  const errors: string[] = [];
  const batches: Record<string, unknown>[][] = [];
  let currentBatch: Record<string, unknown>[] = [];
  let totalRows = 0;

  for (let i = headerRowIdx + 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!Array.isArray(row)) continue;

    // Saltar filas completamente vacías
    const hasData = row.some(c => cellValue(c) !== null);
    if (!hasData) continue;

    const obj: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      const val = cellValue(row[j]);
      // Cantidad siempre en valor absoluto
      if (headers[j] === 'Cantidad' && typeof val === 'number') {
        obj[headers[j]] = Math.abs(val);
      } else {
        obj[headers[j]] = val;
      }
    }

    // Unify zones: map ZP32,ZP44,ZP28,ZP20 → ZP15 automatically
    for (const key of ZONE_KEYS) {
      const rawZone = obj[key];
      if (typeof rawZone === 'string' && ZONE_UNIFICATION_MAP[rawZone]) {
        obj[key] = ZONE_UNIFICATION_MAP[rawZone];
      }
    }

    currentBatch.push(obj);
    if (currentBatch.length >= BATCH_SIZE) {
      batches.push(currentBatch);
      currentBatch = [];
    }
    totalRows++;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  // Preview: primeras 10 filas del primer batch
  const previewRows = batches.length > 0 ? batches[0].slice(0, 10) : [];

  return {
    headers,
    previewRows,
    batches,
    totalRows,
    errors,
  };
}