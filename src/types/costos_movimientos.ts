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

export interface CostoMovimientosColumna {
  id: string;
  nombre: string;
  tipo: ColumnType;
  opciones: string[];
  formula?: FormulaConfig;
  orden: number;
  created_at?: string;
}

export interface CostoMovimientosFila {
  id: string;
  proceso: string;
  subproceso: string;
  valores: Record<string, string | number>;
  formulas?: Record<string, FormulaConfig>;
  orden: number;
  created_at?: string;
}

export interface MovimientosZonaColumnaDinamica {
  id: string;
  zona: string;
  nombre: string;
  tipo: string;
  orden: number;
  formula?: string;
  created_at?: string;
}

export interface MovimientosZonaCeldaFormula {
  id: string;
  columna_id: string;
  articulo: string;
  id_compania?: string;
  formula?: string;
  valor?: number;
  created_at?: string;
  updated_at?: string;
}

export interface MovimientosArticuloResumenRow {
  articulo: string;
  descripcion: string;
  movimientos: number;
  unidades: number;
  meses_distintos: number;
  prom_movimientos_mes: number;
  prom_unidades_mes: number;
}

export interface MovimientosZonaResumenRow {
  zona: string;
  movimientos: number;
  unidades: number;
  articulos_distintos: number;
  meses_distintos: number;
  prom_movimientos_mes: number;
  prom_unidades_mes: number;
}

export interface MovimientosZonaArticuloDetalleRow {
  zona: string;
  articulo: string;
  descripcion: string;
  movimientos: number;
  unidades: number;
}

export interface MovimientosZonaArticuloCompaniaRow {
  zona: string;
  idCompania: string;
  articulo: string;
  descripcion: string;
  movimientos: number;
  unidades: number;
}

export interface MovimientosZonaArticuloMensualRow {
  zona: string;
  idCompania: string;
  articulo: string;
  descripcion: string;
  mes: number;
  mes_nombre: string;
  movimientos: number;
  unidades: number;
}

export interface MovimientosResumenCompleto {
  articulos: MovimientosArticuloResumenRow[];
  zonas: MovimientosZonaResumenRow[];
  zonaArticulos: MovimientosZonaArticuloDetalleRow[];
  totalRows: number;
  totalMovArticulos: number;
  totalMovZonas: number;
  totalUnidArticulos: number;
  totalUnidZonas: number;
  totalArticulos: number;
  totalZonas: number;
}

export const ZONA_CELDA_TOKENS: { token: string; label: string; desc: string }[] = [
  { token: '{MOV}',           label: 'Movimientos',         desc: 'Movimientos del artículo en esta zona' },
  { token: '{UNID}',          label: 'Unidades',            desc: 'Unidades del artículo en esta zona' },
  { token: '{ZONA_MOV}',      label: 'Total Mov. Zona',     desc: 'Total de movimientos de toda la zona' },
  { token: '{ZONA_UNID}',     label: 'Total Unid. Zona',    desc: 'Total de unidades de toda la zona' },
  { token: '{PCT_MOV}',       label: '% Mov. del artículo', desc: 'Porcentaje de mov. del artículo / zona × 100' },
  { token: '{PCT_UNID}',      label: '% Unid. del artículo',desc: 'Porcentaje de unid. del artículo / zona × 100' },
  { token: '{PROM_MOV_MES}',  label: 'Prom. Mov/Mes',       desc: 'Promedio mensual de movimientos del artículo' },
  { token: '{PROM_UNID_MES}', label: 'Prom. Unid/Mes',      desc: 'Promedio mensual de unidades del artículo' },
];
