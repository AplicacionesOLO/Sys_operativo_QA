export interface VolDistribucion {
  id: string;
  nombre: string;
  descripcion: string;
  porcentaje: number;
  porcentaje_inbound: number;
  porcentaje_outbound: number;
  categoria: string;
  color: string;
  icono: string;
  orden: number;
  is_active: boolean;
  unidades: number;
  es_zona_franca?: boolean;
  created_at: string;
  updated_at: string;
}

export const COLOR_CONFIG: Record<string, { hex: string; bg: string; text: string; border: string }> = {
  emerald: { hex: '#10b981', bg: 'bg-emerald-100', text: 'text-emerald-600', border: 'border-emerald-200' },
  amber:   { hex: '#f59e0b', bg: 'bg-amber-100',   text: 'text-amber-600',   border: 'border-amber-200'   },
  rose:    { hex: '#f43f5e', bg: 'bg-rose-100',     text: 'text-rose-600',    border: 'border-rose-200'    },
  sky:     { hex: '#0ea5e9', bg: 'bg-sky-100',      text: 'text-sky-600',     border: 'border-sky-200'     },
  orange:  { hex: '#f97316', bg: 'bg-orange-100',   text: 'text-orange-600',  border: 'border-orange-200'  },
  teal:    { hex: '#14b8a6', bg: 'bg-teal-100',     text: 'text-teal-600',    border: 'border-teal-200'    },
  slate:   { hex: '#64748b', bg: 'bg-slate-100',    text: 'text-slate-600',   border: 'border-slate-200'   },
  lime:    { hex: '#84cc16', bg: 'bg-lime-100',     text: 'text-lime-600',    border: 'border-lime-200'    },
};

// Mapa de colores por defecto para cada proceso de costos_operacion
export const PROCESO_COLOR_MAP: Record<string, string> = {
  'Inbound':    'emerald',
  'Outbound':   'sky',
  'Almacenaje': 'amber',
  'Crossdock':  'orange',
  'Devoluciones': 'rose',
  'Administración': 'teal',
  'Cross Docking': 'orange',
  'No Nacionalizados': 'slate',
};

export const ICON_OPTIONS = [
  'ri-pie-chart-line',
  'ri-pie-chart-2-line',
  'ri-bar-chart-line',
  'ri-bar-chart-2-line',
  'ri-building-4-line',
  'ri-map-pin-2-line',
  'ri-user-3-line',
  'ri-team-line',
  'ri-truck-line',
  'ri-store-line',
  'ri-arrow-down-circle-line',
  'ri-arrow-up-circle-line',
  'ri-swap-line',
  'ri-box-3-line',
  'ri-stack-line',
  'ri-layout-grid-line',
];
