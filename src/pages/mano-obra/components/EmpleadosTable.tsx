import { useState } from 'react';
import type { EmpleadoImportado } from '@/types/mano_obra_empleados';

interface EmpleadosTableProps {
  empleados: EmpleadoImportado[];
  onDelete: (id: string) => void;
}

const PAGE_SIZE = 50;

const COLS: { key: keyof EmpleadoImportado; label: string; width: number; align?: 'right' }[] = [
  { key: 'departamento',      label: 'Departamento',    width: 120 },
  { key: 'puesto_descripcion',label: 'Puesto',          width: 200 },
  { key: 'jefe_inmediato',    label: 'Jefe Inmediato',  width: 180 },
  { key: 'seccion',           label: 'Sección',         width: 140 },
  { key: 'area',              label: 'Área',            width: 130 },
  { key: 'dist',              label: 'Dist',            width: 100, align: 'right' },
  { key: 'empresa_lab',       label: 'Empresa Lab',     width: 110 },
  { key: 'silo',              label: 'Silo',            width: 110 },
  { key: 'tipo',              label: 'Tipo',            width: 110 },
];

// ── Filters ──────────────────────────────────────────────────────────────────

interface Filters {
  departamento: string;
  area: string;
  seccion: string;
  tipo: string;
  search: string;
}

function getUnique(empleados: EmpleadoImportado[], field: keyof EmpleadoImportado): string[] {
  const set = new Set(empleados.map(e => String(e[field] ?? '')).filter(Boolean));
  return [...set].sort();
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EmpleadosTable({ empleados, onDelete }: EmpleadosTableProps) {
  const [page, setPage]     = useState(0);
  const [filters, setFilters] = useState<Filters>({ departamento: '', area: '', seccion: '', tipo: '', search: '' });

  const setFilter = (key: keyof Filters, val: string) => {
    setFilters(prev => ({ ...prev, [key]: val }));
    setPage(0);
  };

  // Apply filters
  const filtered = empleados.filter(e => {
    if (filters.departamento && e.departamento !== filters.departamento) return false;
    if (filters.area && e.area !== filters.area) return false;
    if (filters.seccion && e.seccion !== filters.seccion) return false;
    if (filters.tipo && e.tipo !== filters.tipo) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const haystack = [e.puesto_descripcion, e.jefe_inmediato, e.empresa_lab, e.silo]
        .join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const minWidth = COLS.reduce((s, c) => s + c.width, 0) + 60;

  if (empleados.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 px-8 py-16 flex flex-col items-center gap-4">
        <div className="w-14 h-14 flex items-center justify-center rounded-full bg-slate-100">
          <i className="ri-group-line text-2xl text-slate-400" />
        </div>
        <div className="text-center">
          <p className="text-slate-600 font-medium text-sm">Sin empleados importados</p>
          <p className="text-slate-400 text-xs mt-1">Usa el botón "Importar empleados" para cargar el archivo Excel o CSV</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Filters bar */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 flex-1 min-w-[180px] max-w-xs">
          <i className="ri-search-line text-slate-400 text-sm" />
          <input
            type="text"
            value={filters.search}
            onChange={e => setFilter('search', e.target.value)}
            placeholder="Buscar puesto, jefe, empresa..."
            className="bg-transparent text-sm text-slate-700 focus:outline-none w-full placeholder:text-slate-400"
          />
        </div>
        <FilterSelect label="Depto" options={getUnique(empleados, 'departamento')} value={filters.departamento} onChange={v => setFilter('departamento', v)} />
        <FilterSelect label="Área" options={getUnique(empleados, 'area')} value={filters.area} onChange={v => setFilter('area', v)} />
        <FilterSelect label="Sección" options={getUnique(empleados, 'seccion')} value={filters.seccion} onChange={v => setFilter('seccion', v)} />
        <FilterSelect label="Tipo" options={getUnique(empleados, 'tipo')} value={filters.tipo} onChange={v => setFilter('tipo', v)} />
        <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
          {filtered.length} de {empleados.length} registros
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table
          className="w-full text-sm"
          style={{ minWidth: `${minWidth}px`, borderCollapse: 'separate', borderSpacing: 0 }}
        >
          <thead>
            <tr className="bg-slate-800">
              {COLS.map(col => (
                <th
                  key={col.key}
                  className="px-3 py-3 border-r border-slate-700 last:border-r-0"
                  style={{ width: col.width, minWidth: col.width, textAlign: col.align ?? 'left' }}
                >
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider whitespace-nowrap">
                    {col.label}
                  </span>
                </th>
              ))}
              <th className="px-2 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {visible.map((emp, idx) => (
              <tr
                key={emp.id}
                className={`border-b border-slate-100 hover:bg-slate-50/60 transition-colors group/row ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
              >
                {COLS.map(col => {
                  const val = emp[col.key];
                  const isNum = col.key === 'dist';
                  return (
                    <td
                      key={col.key}
                      className="px-3 py-2.5 border-r border-slate-100 last:border-r-0"
                      style={{ textAlign: col.align }}
                    >
                      {isNum
                        ? <span className="text-sm tabular-nums text-slate-600">{Number(val).toFixed(2)}</span>
                        : <span className="text-sm text-slate-700 truncate block" style={{ maxWidth: col.width - 16 }} title={String(val ?? '')}>{String(val ?? '') || '—'}</span>
                      }
                    </td>
                  );
                })}
                <td className="px-2 py-2.5 text-center">
                  <button
                    onClick={() => { if (confirm('¿Eliminar este registro?')) onDelete(emp.id); }}
                    className="w-7 h-7 flex items-center justify-center rounded opacity-0 group-hover/row:opacity-100 text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all cursor-pointer"
                  >
                    <i className="ri-delete-bin-6-line text-sm" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Página {page + 1} de {totalPages} · {filtered.length} registros
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 cursor-pointer text-slate-600 transition-colors"
            >
              <i className="ri-arrow-left-s-line" />
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 cursor-pointer text-slate-600 transition-colors"
            >
              <i className="ri-arrow-right-s-line" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface FilterSelectProps {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}

function FilterSelect({ label, options, value, onChange }: FilterSelectProps) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white focus:outline-none focus:border-slate-300 cursor-pointer"
    >
      <option value="">Todos {label}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
