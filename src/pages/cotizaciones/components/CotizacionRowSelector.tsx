import { useState, useMemo } from 'react';
import type { CostoFila, CostoColumna } from '@/types/costos';
import { formatCellValue } from '@/types/costos';
import type { FormulaContext } from '@/lib/formulaEngine';
import { calcularFormula, EMPTY_FORMULA_CTX } from '@/lib/formulaEngine';

const PROCESO_COLORS: Record<string, string> = {
  'Inbound':           'bg-emerald-50 border-l-emerald-400',
  'Outbound':          'bg-sky-50 border-l-sky-400',
  'Almacenaje':        'bg-amber-50 border-l-amber-400',
  'No Nacionalizados': 'bg-rose-50 border-l-rose-400',
  'Cross Docking':     'bg-violet-50 border-l-violet-400',
  'Devoluciones':      'bg-orange-50 border-l-orange-400',
  'Administración':    'bg-teal-50 border-l-teal-400',
};
function getProcesoClass(proceso: string) {
  return PROCESO_COLORS[proceso] ?? 'bg-slate-50 border-l-slate-400';
}

function getRowTotal(fila: CostoFila, columnas: CostoColumna[], ctx: FormulaContext): number {
  return columnas.reduce((sum, col) => {
    if (col.tipo === 'texto' || col.tipo === 'select') return sum;
    if (col.tipo === 'formula') {
      const f = fila.formulas?.[col.id] ?? col.formula;
      if (!f) return sum;
      const mode = f.mode ?? 'terms';
      const has = (mode === 'expression' && !!f.expression?.trim()) ||
        (mode === 'terms' && (f.terminos?.length ?? 0) > 0);
      return has ? sum + calcularFormula(f, ctx, fila.subproceso) : sum;
    }
    const v = Number(fila.valores[col.id] ?? 0);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);
}

interface Props {
  filas: CostoFila[];
  columnas: CostoColumna[];
  formulaCtx?: FormulaContext;
  selectedIds: Set<string>;
  onToggle: (filaId: string) => void;
  onSelectAll: (proceso: string) => void;
  onDeselectAll: (proceso: string) => void;
}

export default function CotizacionRowSelector({
  filas, columnas, formulaCtx, selectedIds, onToggle, onSelectAll, onDeselectAll,
}: Props) {
  const ctx = formulaCtx ?? EMPTY_FORMULA_CTX;
  const [search, setSearch] = useState('');
  const [expandedProcesos, setExpandedProcesos] = useState<Set<string>>(new Set());

  // Group filas by proceso
  const grupos = useMemo(() => {
    const map = new Map<string, CostoFila[]>();
    filas.forEach(f => {
      const key = f.proceso;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    });
    return Array.from(map.entries()).map(([proceso, rows]) => ({ proceso, rows }));
  }, [filas]);

  const filteredGrupos = useMemo(() => {
    if (!search.trim()) return grupos;
    const q = search.toLowerCase();
    return grupos
      .map(g => ({
        ...g,
        rows: g.rows.filter(r =>
          r.proceso.toLowerCase().includes(q) ||
          r.subproceso.toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.rows.length > 0);
  }, [grupos, search]);

  const toggleProceso = (proceso: string) => {
    setExpandedProcesos(prev => {
      const next = new Set(prev);
      if (next.has(proceso)) next.delete(proceso);
      else next.add(proceso);
      return next;
    });
  };

  // Initialize: expand all by default on first render
  useMemo(() => {
    setExpandedProcesos(new Set(grupos.map(g => g.proceso)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupos.length]);

  const totalSelected = selectedIds.size;

  return (
    <div className="flex flex-col h-full">
      {/* Search + count */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            <i className="ri-search-2-line text-xs text-slate-400" />
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar proceso o subproceso..."
            className="flex-1 text-sm text-slate-600 placeholder-slate-300 bg-transparent focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="w-4 h-4 flex items-center justify-center cursor-pointer">
              <i className="ri-close-line text-xs text-slate-400 hover:text-slate-600" />
            </button>
          )}
        </div>
        {totalSelected > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
            <i className="ri-check-line text-xs text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700">{totalSelected} seleccionado{totalSelected !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Groups */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
        {filteredGrupos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-100">
              <i className="ri-search-line text-xl text-slate-400" />
            </div>
            <p className="text-sm text-slate-400">Sin resultados</p>
          </div>
        ) : filteredGrupos.map(({ proceso, rows }) => {
          const isExpanded = expandedProcesos.has(proceso) || !!search.trim();
          const selectedInGroup = rows.filter(r => selectedIds.has(r.id)).length;
          const allSelected = selectedInGroup === rows.length;
          const procesoClass = getProcesoClass(proceso);

          return (
            <div key={proceso}>
              {/* Process header */}
              <div
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none hover:bg-slate-50 transition-colors border-l-4 ${procesoClass}`}
                onClick={() => toggleProceso(proceso)}
              >
                <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                  <i className={`text-xs text-slate-400 transition-transform ${isExpanded ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'}`} />
                </div>
                <span className="text-sm font-bold text-slate-700 flex-1">{proceso}</span>
                <span className="text-xs text-slate-400">{rows.length} subproceso{rows.length !== 1 ? 's' : ''}</span>
                {selectedInGroup > 0 && (
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    {selectedInGroup}/{rows.length}
                  </span>
                )}
                {/* Select/deselect all of group */}
                <button
                  onClick={e => { e.stopPropagation(); allSelected ? onDeselectAll(proceso) : onSelectAll(proceso); }}
                  className="text-xs text-slate-400 hover:text-emerald-600 font-medium transition-colors cursor-pointer whitespace-nowrap px-2 py-1 rounded hover:bg-emerald-50"
                >
                  {allSelected ? 'Quitar todos' : 'Todos'}
                </button>
              </div>

              {/* Rows */}
              {isExpanded && rows.map(fila => {
                const isSelected = selectedIds.has(fila.id);
                const rowTotal = getRowTotal(fila, columnas, ctx);
                return (
                  <div
                    key={fila.id}
                    onClick={() => onToggle(fila.id)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all border-b border-slate-50 ${
                      isSelected
                        ? 'bg-emerald-50/80 hover:bg-emerald-50'
                        : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    {/* Checkbox visual */}
                    <div className={`w-5 h-5 flex items-center justify-center rounded border-2 flex-shrink-0 transition-all ${
                      isSelected
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'border-slate-300 bg-white hover:border-emerald-400'
                    }`}>
                      {isSelected && <i className="ri-check-line text-white text-xs" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
                          <i className="ri-map-pin-2-line text-xs text-slate-400" />
                        </div>
                        <span className="text-sm font-medium text-slate-700 truncate">
                          {fila.subproceso || <span className="italic text-slate-400 text-xs">Sin subproceso</span>}
                        </span>
                      </div>
                    </div>

                    {/* Total */}
                    {rowTotal > 0 && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs font-bold text-teal-600 tabular-nums">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(rowTotal)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
