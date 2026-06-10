export interface EmpleadoImportado {
  id: string;
  departamento: string;
  puesto_descripcion: string;
  jefe_inmediato: string;
  seccion: string;
  area: string;
  dist: number;
  empresa_lab: string;
  silo: string;
  tipo: string;
  import_batch_id?: string | null;
  source_file_name?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Fila tal como viene del parser (antes de guardar en DB) */
export interface EmpleadoParsed {
  departamento: string;
  puesto_descripcion: string;
  jefe_inmediato: string;
  seccion: string;
  area: string;
  dist: number;
  empresa_lab: string;
  silo: string;
  tipo: string;
  /** Errores de validación de esta fila (vacío = válida) */
  errors: string[];
  /** Índice original en el archivo (1-based) */
  rowIndex: number;
}

export interface EmpleadosParseResult {
  rows: EmpleadoParsed[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: string[]; // errores de estructura del archivo
}

/** Totales de distribución agrupados */
export interface DistribucionAgregada {
  key: string;      // nombre del área / sección / departamento
  total_dist: number;
  count: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

export const EMPLEADOS_COLUMNS: { key: keyof EmpleadoImportado; label: string }[] = [
  { key: 'departamento',     label: 'Departamento'    },
  { key: 'puesto_descripcion', label: 'Puesto Descripción' },
  { key: 'jefe_inmediato',   label: 'Jefe Inmediato'  },
  { key: 'seccion',          label: 'Sección'         },
  { key: 'area',             label: 'Área'            },
  { key: 'dist',             label: 'Dist'            },
  { key: 'empresa_lab',      label: 'Empresa Lab'     },
  { key: 'silo',             label: 'Silo'            },
  { key: 'tipo',             label: 'Tipo'            },
];
