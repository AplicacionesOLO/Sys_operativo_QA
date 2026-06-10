import type { CostoFila } from '@/types/costos';

interface Props {
  filas: CostoFila[];
  selectedIds: Set<string>;
  onToggle: (filaId: string) => void;
  onSelectAll: (proceso: string) => void;
  onDeselectAll: (proceso: string) => void;
}

const PROCESO_COLORS: Record<string, string> = {
  'Inbound': '#10b981', 'Outbound': '#0ea5e9', 'Almacenaje': '#f59e0b',
  'No Nacionalizados': '#f43f5e', 'Cross Docking': '#8b5cf6',
  'Devoluciones': '#f97316', 'Administración': '#14b8a6',
};
function getColor(p: string) { return PROCESO_COLORS[p] ?? '#64748b'; }

export default function CotizacionSubprocesoSelector({ filas, selectedIds, onToggle, onSelectAll, onDeselectAll }: Props) {
  const grupos = new Map<string, CostoFila[]>();
  filas.forEach(f => {
    if (!grupos.has(f.proceso)) grupos.set(f.proceso, []);
    grupos.get(f.proceso)!.push(f);
  });

  return (
    <div className="overflow-y-auto h-full">
      {Array.from(grupos.entries()).map(([proceso, rows]) => {
        const allSelected = rows.every(r => selectedIds.has(r.id));
        const someSelected = rows.some(r => selectedIds.has(r.id));
        return (
          <div key={proceso} className="border-b border-slate-50 last:border-0">
            {/* Proceso header */}
            <div
              className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 sticky top-0 z-10"
              style={{ borderLeft: `3px solid ${getColor(proceso)}` }}
            >
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex-1 truncate">{proceso}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onSelectAll(proceso)}
                  disabled={allSelected}
                  className="text-xs text-emerald-600 hover:text-emerald-700 disabled:opacity-30 cursor-pointer whitespace-nowrap transition-colors"
                  title="Seleccionar todos"
                >
                  Todo
                </button>
                {someSelected && (
                  <>
                    <span className="text-slate-300">·</span>
                    <button
                      onClick={() => onDeselectAll(proceso)}
                      className="text-xs text-rose-500 hover:text-rose-600 cursor-pointer whitespace-nowrap transition-colors"
                      title="Deseleccionar todos"
                    >
                      Ninguno
                    </button>
                  </>
                )}
              </div>
            </div>
            {/* Rows */}
            {rows.map(fila => {
              const isSelected = selectedIds.has(fila.id);
              return (
                <div
                  key={fila.id}
                  onClick={() => onToggle(fila.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-all ${
                    isSelected ? 'bg-emerald-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-all ${
                    isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 bg-white'
                  }`}>
                    {isSelected && <i className="ri-check-line text-white" style={{ fontSize: 10 }} />}
                  </div>
                  <span className={`text-xs truncate ${isSelected ? 'text-emerald-700 font-medium' : 'text-slate-600'}`}>
                    {fila.subproceso || <span className="italic text-slate-400">Sin nombre</span>}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
