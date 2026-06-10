// ─── Cabecera ────────────────────────────────────────────────────────────────
export type CotizacionEstadoV2 = 'borrador' | 'vigente' | 'cerrada' | 'historica';

export interface CotizacionCabecera {
  id: string;
  cliente: string;
  mes: number;        // 1–12
  anio: number;
  version: number;
  estado: CotizacionEstadoV2;
  moneda: string;
  total_general: number;
  total_formula: string | null;
  notas: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// ─── Detalle ─────────────────────────────────────────────────────────────────
export interface CotizacionDetalle {
  id: string;
  cabecera_id: string;
  proceso: string;
  subproceso: string;
  costo_base: number;
  multiplicador_base: number;
  total_final: number;
  orden: number;
  notas_fila: string;
  costo_fila_id: string | null;
  created_at: string;
}

// ─── Columnas dinámicas ───────────────────────────────────────────────────────
/** @deprecated use ColDisplayFormat instead */
export type ColDataType = 'number' | 'percent' | 'currency' | 'text' | 'formula';
export type ColDisplayFormat = 'number' | 'percent' | 'currency';
export type ColInputType = 'input';
export type ColEffectType = 'add' | 'subtract' | 'multiply' | 'display_only' | 'formula';
export type ColAppliesTo = 'all' | 'process' | 'subprocess';

export interface CotizacionColumnaDinamica {
  id: string;
  name: string;
  key: string;
  /** @deprecated use display_format */
  data_type: ColDataType;
  display_format: ColDisplayFormat;
  input_type: ColInputType;
  effect_type: ColEffectType;
  applies_to: ColAppliesTo;
  formula_expression: string | null;
  is_editable: boolean;
  is_visible: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

// ─── Valores dinámicos ────────────────────────────────────────────────────────
export interface CotizacionValorDinamico {
  id: string;
  detalle_id: string;
  columna_id: string;
  raw_value: string;
  computed_value: number;
  updated_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
export const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

export const ESTADO_V2_CONFIG: Record<CotizacionEstadoV2, { label: string; color: string; dot: string; icon: string }> = {
  borrador:  { label: 'Borrador',  color: 'bg-slate-100 text-slate-600',    dot: 'bg-slate-400',   icon: 'ri-draft-line' },
  vigente:   { label: 'Vigente',   color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', icon: 'ri-checkbox-circle-line' },
  cerrada:   { label: 'Cerrada',   color: 'bg-sky-100 text-sky-700',         dot: 'bg-sky-500',     icon: 'ri-lock-line' },
  historica: { label: 'Histórica', color: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500',   icon: 'ri-time-line' },
};

export const MONEDAS = ['USD', 'COP', 'EUR', 'MXN', 'PEN', 'CLP'];

export const EFFECT_TYPE_LABELS: Record<ColEffectType, string> = {
  add:          'Suma al total',
  subtract:     'Resta al total',
  multiply:     'Multiplica el total',
  display_only: 'Solo visualización',
  formula:      'Fórmula personalizada',
};

export const DATA_TYPE_LABELS: Record<ColDataType, string> = {
  number:   'Número',
  percent:  'Porcentaje',
  currency: 'Moneda',
  text:     'Texto',
  formula:  'Fórmula',
};

export const DISPLAY_FORMAT_LABELS: Record<ColDisplayFormat, string> = {
  number:   'Número',
  percent:  'Porcentaje',
  currency: 'Moneda',
};

// Variables base disponibles en fórmulas de cotización
export const BASE_FORMULA_VARS: { key: string; label: string; description: string }[] = [
  { key: 'costo_base',    label: 'Costo base',    description: 'Costo base de la fila' },
  { key: 'multiplicador', label: 'Multiplicador', description: 'Multiplicador de la fila' },
  { key: 'subtotal_item', label: 'Subtotal ítem', description: 'costo_base × multiplicador' },
  { key: 'total_item',    label: 'Total ítem',    description: 'Total calculado con columnas previas' },
];

// ─── Agrupación para sidebar ──────────────────────────────────────────────────
export interface ClienteGroup {
  cliente: string;
  cotizaciones: CotizacionCabecera[];
}

// ─── Detalle enriquecido con valores dinámicos ────────────────────────────────
export interface DetalleConValores extends CotizacionDetalle {
  valores: Record<string, CotizacionValorDinamico>; // key = columna_id
}
