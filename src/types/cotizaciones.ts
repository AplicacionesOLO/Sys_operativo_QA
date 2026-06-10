export type CotizacionEstado = 'borrador' | 'enviada' | 'aprobada' | 'rechazada';

export interface Cotizacion {
  id: string;
  nombre: string;
  cliente: string;
  descripcion: string;
  notas: string;
  estado: CotizacionEstado;
  sim_multiplier: number;
  /** null = todas visibles. Array de IDs = solo esas columnas visibles */
  columnas_visibles: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface CotizacionItem {
  id: string;
  cotizacion_id: string;
  costo_fila_id: string;
  multiplicador: number;
  orden: number;
  notas_item: string;
  /** Fórmulas sobreescritas exclusivamente para esta cotización. Clave = columna id */
  formulas_override: Record<string, import('@/types/costos').FormulaConfig>;
  created_at: string;
}

export const ESTADO_CONFIG: Record<CotizacionEstado, { label: string; color: string; icon: string }> = {
  borrador:   { label: 'Borrador',   color: 'bg-slate-100 text-slate-600',   icon: 'ri-draft-line' },
  enviada:    { label: 'Enviada',    color: 'bg-amber-100 text-amber-700',   icon: 'ri-send-plane-line' },
  aprobada:   { label: 'Aprobada',   color: 'bg-emerald-100 text-emerald-700', icon: 'ri-checkbox-circle-line' },
  rechazada:  { label: 'Rechazada', color: 'bg-rose-100 text-rose-700',     icon: 'ri-close-circle-line' },
};
