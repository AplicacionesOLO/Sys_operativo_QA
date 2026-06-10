import type { Cotizacion } from '@/types/cotizaciones';
import { ESTADO_CONFIG } from '@/types/cotizaciones';

interface Props {
  cotizaciones: Cotizacion[];
  selectedId: string | null;
  onSelect: (c: Cotizacion) => void;
  onNew: () => void;
  onEdit: (c: Cotizacion) => void;
  onDelete: (id: string) => void;
}

export default function CotizacionesList({ cotizaciones, selectedId, onSelect, onNew, onEdit, onDelete }: Props) {
  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-700">Cotizaciones</p>
          <p className="text-xs text-slate-400">{cotizaciones.length} guardada{cotizaciones.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-add-line" />
          Nueva
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
        {cotizaciones.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 px-4 text-center">
            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100">
              <i className="ri-file-list-3-line text-lg text-slate-400" />
            </div>
            <p className="text-xs text-slate-400">Crea tu primera cotización</p>
          </div>
        ) : cotizaciones.map(c => {
          const cfg = ESTADO_CONFIG[c.estado];
          const isActive = c.id === selectedId;
          return (
            <div
              key={c.id}
              onClick={() => onSelect(c)}
              className={`flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-all group ${
                isActive ? 'bg-emerald-50 border-l-2 border-emerald-500' : 'hover:bg-slate-50 border-l-2 border-transparent'
              }`}
            >
              {/* Status dot */}
              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                c.estado === 'aprobada' ? 'bg-emerald-500' :
                c.estado === 'enviada' ? 'bg-amber-500' :
                c.estado === 'rechazada' ? 'bg-rose-500' :
                'bg-slate-300'
              }`} />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate">{c.nombre}</p>
                <p className="text-xs text-slate-400 truncate mt-0.5">{c.cliente}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
                    <i className={`${cfg.icon} mr-1`} />
                    {cfg.label}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(c.created_at).toLocaleDateString('es-CO', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  onClick={e => { e.stopPropagation(); onEdit(c); }}
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                  title="Editar"
                >
                  <i className="ri-pencil-line text-xs" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onDelete(c.id); }}
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                  title="Eliminar"
                >
                  <i className="ri-delete-bin-6-line text-xs" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
