export type ColumnType = 'moneda' | 'numero' | 'porcentaje' | 'texto' | 'select' | 'fecha';

export interface ModuloColumna {
  id: string;
  nombre: string;
  tipo: ColumnType;
  opciones: string[];
  orden: number;
}

export interface VolumenFila {
  id: string;
  proceso: string;
  subproceso: string;
  periodo: string;
  valores: Record<string, string | number>;
  created_at?: string;
}

export const COLUMN_TYPES: { value: ColumnType; label: string; icon: string }[] = [
  { value: 'moneda', label: 'Moneda', icon: 'ri-money-dollar-circle-line' },
  { value: 'numero', label: 'Número', icon: 'ri-hashtag' },
  { value: 'porcentaje', label: 'Porcentaje', icon: 'ri-percent-line' },
  { value: 'texto', label: 'Texto', icon: 'ri-text' },
  { value: 'select', label: 'Lista', icon: 'ri-list-check' },
  { value: 'fecha', label: 'Fecha', icon: 'ri-calendar-line' },
];

export function formatCellValue(value: string | number | null | undefined, tipo: ColumnType): string {
  if (value === null || value === undefined || value === '') return '—';
  if (tipo === 'moneda') {
    const n = Number(value);
    if (isNaN(n)) return String(value);
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
  }
  if (tipo === 'numero') {
    const n = Number(value);
    if (isNaN(n)) return String(value);
    return new Intl.NumberFormat('es-CO').format(n);
  }
  if (tipo === 'porcentaje') return `${value}%`;
  return String(value);
}

export function getColumnTotal(
  filas: VolumenFila[],
  columnaId: string,
  tipo: ColumnType
): number | null {
  if (!['moneda', 'numero'].includes(tipo)) return null;
  const nums = filas.map(f => Number(f.valores[columnaId])).filter(n => !isNaN(n) && n !== 0);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0);
}

/** Fila de cliente: sus valores por mes (label→valor) y total acumulado */
export interface ExcelClientRow {
  cliente: string;
  meses: Record<string, number>;   // mes label → valor
  total: number;
}

export interface ExcelParseResult {
  recibidas: ExcelClientRow[];
  despachadas: ExcelClientRow[];
  meses: string[];               // labels de meses detectados (orden del Excel)
  clientes: string[];            // union de clientes de ambos bloques
  totalInOut: ExcelClientRow | null;
  errors: string[];
}

// Legacy (ya no se usa en el parser nuevo, se mantiene por compatibilidad de módulos viejos)
export interface ExcelBlockRow {
  mes: string;
  total: number;
  porcentaje: number;
  clientes: Record<string, number>;
}
