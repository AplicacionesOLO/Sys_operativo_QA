import type { FormulaConfig } from './costos';

export interface Zona {
  id: string;
  nombre: string;
  created_at?: string;
}

export interface TipoArea {
  id: string;
  nombre: string;
  descripcion: string;
  color: string;
  icono: string;
  costo_por_m2: number;
  moneda: string;
  created_at?: string;
}

export type CategoriaArea = 'Interior' | 'Exterior';

export interface Area {
  id: string;
  nombre: string;
  tipo_area_id: string | null;
  parent_id: string | null;
  zona_id: string | null;
  categoria: CategoriaArea | null;
  metros_cuadrados: number;
  moneda: string;
  descripcion: string;
  activo: boolean;
  tiene_automatizacion: boolean;
  metros_automatizacion: number;
  cantidad_racks: number | null;
  metros_cubicos: number | null;
  /** Costo total calculado del área (por fórmula o por tipo×m²) */
  costo_area: number | null;
  /** Fórmula que calcula el costo del área */
  costo_area_formula: FormulaConfig | null;
  created_at?: string;
}

export interface AreaConHijos extends Area {
  hijos?: Area[];
  tipo?: TipoArea;
}

export interface AreaDistribution {
  id: string;
  area_name: string;
  area_type: string;
  area_type_color: string | null;
  area_type_icon: string | null;
  square_meters: number;
  cubic_meters: number;
  categoria: string;
  type_distribution_percentage: number;
  global_distribution_percentage: number;
  category_distribution_percentage: number;
  // ── Distribución por metros cúbicos ──────────────────────────────────────
  type_distribution_cubic_percentage: number;
  global_distribution_cubic_percentage: number;
  category_distribution_cubic_percentage: number;
  created_at?: string;
}

export interface Moneda {
  code: string;
  symbol: string;
  name: string;
}

export const MONEDAS: Moneda[] = [
  { code: 'USD', symbol: '$', name: 'Dólar Americano' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'MXN', symbol: '$', name: 'Peso Mexicano' },
  { code: 'GTQ', symbol: 'Q', name: 'Quetzal Guatemalteco' },
  { code: 'COP', symbol: '$', name: 'Peso Colombiano' },
  { code: 'PEN', symbol: 'S/', name: 'Sol Peruano' },
];

export const TIPO_COLORS: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  rose: 'bg-rose-100 text-rose-700',
  sky: 'bg-sky-100 text-sky-700',
  violet: 'bg-violet-100 text-violet-700',
  orange: 'bg-orange-100 text-orange-700',
};

export const TIPO_COLORS_BORDER: Record<string, string> = {
  emerald: 'border-emerald-200',
  amber: 'border-amber-200',
  rose: 'border-rose-200',
  sky: 'border-sky-200',
  violet: 'border-violet-200',
  orange: 'border-orange-200',
};

export function formatMoneda(amount: number, moneda: string): string {
  const m = MONEDAS.find((x) => x.code === moneda);
  try {
    return new Intl.NumberFormat('es-US', {
      style: 'currency',
      currency: moneda,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${m?.symbol ?? ''}${amount.toLocaleString('es-US', { minimumFractionDigits: 2 })} ${moneda}`;
  }
}
