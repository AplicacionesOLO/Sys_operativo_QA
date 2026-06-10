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
  mode?: 'terms' | 'expression';
  terminos: FormulaTermino[];
  expression?: string;
}

export interface CostoOutboundColumna {
  id: string;
  nombre: string;
  tipo: ColumnType;
  opciones: string[];
  formula?: FormulaConfig;
  orden: number;
  created_at?: string;
}

export interface CostoOutboundFila {
  id: string;
  proceso: string;
  subproceso: string;
  valores: Record<string, string | number>;
  formulas?: Record<string, FormulaConfig>;
  orden: number;
  created_at?: string;
}

export interface ZonaColumnaDinamica {
  id: string;
  zona: string;
  nombre: string;
  tipo: string;
  orden: number;
  formula?: string;
  created_at?: string;
}

export interface ZonaCeldaFormula {
  id: string;
  columna_id: string;
  articulo: string;
  formula: string;
  valor?: number;
  created_at?: string;
  updated_at?: string;
}

export const ZONA_CELDA_TOKENS: { token: string; label: string; desc: string }[] = [
  { token: '{MOV}', label: 'Movimientos', desc: 'Movimientos del artículo en esta zona' },
  { token: '{UNID}', label: 'Unidades', desc: 'Unidades del artículo en esta zona' },
  { token: '{ZONA_MOV}', label: 'Total Mov. Zona', desc: 'Total de movimientos de toda la zona' },
  { token: '{ZONA_UNID}', label: 'Total Unid. Zona', desc: 'Total de unidades de toda la zona' },
  { token: '{PCT_MOV}', label: '% Mov. del artículo', desc: 'Porcentaje de mov. del artículo / zona * 100' },
  { token: '{PCT_UNID}', label: '% Unid. del artículo', desc: 'Porcentaje de unid. del artículo / zona * 100' },
];

export const COLUMN_TYPES: { value: ColumnType; label: string; icon: string }[] = [
  { value: 'moneda',     label: 'Moneda',      icon: 'ri-money-dollar-circle-line' },
  { value: 'numero',     label: 'Numérica',    icon: 'ri-hashtag'                  },
  { value: 'porcentaje', label: 'Porcentaje',  icon: 'ri-percent-line'             },
  { value: 'texto',      label: 'Texto',       icon: 'ri-text'                     },
  { value: 'select',     label: 'Lista/Select',icon: 'ri-list-check'               },
  { value: 'formula',    label: 'Fórmula',     icon: 'ri-functions'                },
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