export type ColumnType = 'moneda' | 'numero' | 'porcentaje' | 'texto' | 'select' | 'formula';

export interface FormulaTermino {
  id: string;
  tipo: 'inversion_depreciacion' | 'inversion_pago_mensual' | 'gastos_varios_columna';
  referenciaId: string;
  referenciaNombre: string;
  factor: number;
  aplicarDistribucion: boolean;
  areaFuente: 'subproceso_fila' | string;
  filtrarPorArea?: boolean;
}

export interface FormulaConfig {
  /** 'terms' = visual builder (legacy), 'expression' = free-form expression with {VAR} tokens */
  mode?: 'terms' | 'expression';
  terminos: FormulaTermino[];
  /** Only used when mode === 'expression'. Contains {TOKEN} placeholders. */
  expression?: string;
}

export interface CostoColumna {
  id: string;
  nombre: string;
  tipo: ColumnType;
  opciones: string[];
  formula?: FormulaConfig;
  orden: number;
  created_at?: string;
}

export interface CostoFila {
  id: string;
  proceso: string;
  subproceso: string;
  valores: Record<string, string | number>;
  /** Fórmulas independientes por columna. Clave = columna id. Sobreescribe la fórmula de la columna. */
  formulas?: Record<string, FormulaConfig>;
  orden: number;
  created_at?: string;
}

export const COLUMN_TYPES: { value: ColumnType; label: string; icon: string }[] = [
  { value: 'moneda',     label: 'Moneda',      icon: 'ri-money-dollar-circle-line' },
  { value: 'numero',     label: 'Numérica',    icon: 'ri-hashtag'                  },
  { value: 'porcentaje', label: 'Porcentaje',  icon: 'ri-percent-line'             },
  { value: 'texto',      label: 'Texto',       icon: 'ri-text'                     },
  { value: 'select',     label: 'Lista/Select',icon: 'ri-list-check'               },
  { value: 'formula',    label: 'Fórmula',     icon: 'ri-functions'                },
];

export const PROCESOS_SUGERIDOS = [
  'Inbound', 'Outbound', 'Almacenaje', 'No Nacionalizados',
  'Cross Docking', 'Devoluciones', 'Administración',
];

export const TIPO_GASTO_OPCIONES = [
  'Depreciación', 'Alquiler', 'Equipo', 'Personal', 'Servicios', 'Otro',
];

export function formatCellValue(value: string | number | undefined, tipo: ColumnType): string {
  if (value === undefined || value === null || value === '') return '';
  const num = Number(value);
  if (isNaN(num) && tipo !== 'texto' && tipo !== 'select') return String(value);
  switch (tipo) {
    case 'moneda':
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
    case 'formula':
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(num);
    case 'numero':
      return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 6 }).format(num);
    case 'porcentaje':
      return `${num.toFixed(4)}%`;
    default:
      return String(value);
  }
}

export function getColumnTotal(filas: CostoFila[], columnaId: string, tipo: ColumnType): number | null {
  if (tipo === 'texto' || tipo === 'select') return null;
  return filas.reduce((acc, fila) => {
    const val = Number(fila.valores[columnaId] ?? 0);
    return acc + (isNaN(val) ? 0 : val);
  }, 0);
}

export const PROCESO_COLORS: Record<string, string> = {
  'Inbound':           'border-l-emerald-500 bg-emerald-50/40',
  'Outbound':          'border-l-blue-500 bg-blue-50/40',
  'Almacenaje':        'border-l-amber-500 bg-amber-50/40',
  'No Nacionalizados': 'border-l-rose-500 bg-rose-50/40',
  'Cross Docking':     'border-l-violet-500 bg-violet-50/40',
  'Devoluciones':      'border-l-orange-500 bg-orange-50/40',
  'Administración':    'border-l-teal-500 bg-teal-50/40',
};

export function getProcesoStyle(proceso: string): string {
  return PROCESO_COLORS[proceso] ?? 'border-l-slate-400 bg-slate-50/40';
}
