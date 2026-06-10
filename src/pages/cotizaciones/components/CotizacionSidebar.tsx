import { useState, useMemo } from 'react';
import type { CotizacionCabecera, ClienteGroup } from '@/types/cotizaciones_v2';
import { ESTADO_V2_CONFIG, MESES } from '@/types/cotizaciones_v2';

interface Props {
  cotizaciones: CotizacionCabecera[];
  selectedId: string | null;
  onSelect: (c: CotizacionCabecera) => void;
  onNew: () => void;
  onDuplicate: (c: CotizacionCabecera) => void;
  onDelete: (id: string) => void;
}

type FilterEstado = 'todas' | 'vigente' | 'borrador' | 'cerrada' | 'historica';

export default function CotizacionSidebar({
  cotizaciones, selectedId, onSelect, onNew, onDuplicate, onDelete,
}: Props) {
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<FilterEstado>('todas');
  const [expandedClientes, setExpandedClientes] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    return cotizaciones.filter(c => {
      const matchSearch = !search ||
        c.cliente.toLowerCase().includes(search.toLowerCase()) ||
        `${MESES[c.mes - 1]} ${c.anio}`.toLowerCase().includes(search.toLowerCase());
      const matchEstado = filterEstado === 'todas' || c.estado === filterEstado;
      return matchSearch && matchEstado;
    });
  }, [cotizaciones, search, filterEstado]);

  // Group by cliente
  const groups = useMemo<ClienteGroup[]>(() => {
    const map = new Map<string, CotizacionCabecera[]>();
    filtered.forEach(c => {
      if (!map.has(c.cliente)) map.set(c.cliente, []);
      map.get(c.cliente)!.push(c);
    });
    return Array.from(map.entries()).map(([cliente, cots]) => ({
      cliente,
      cotizaciones: cots.sort((a, b) => {
        if (a.anio !== b.anio) return b.anio - a.anio;
        if (a.mes !== b.mes) return b.mes - a.mes;
        return b.version - a.version;
      }),
    }));
  }, [filtered]);

  const toggleCliente = (cliente: string) => {
    setExpandedClientes(prev => {
      const next = new Set(prev);
      if (next.has(cliente)) next.delete(cliente);
      else next.add(cliente);
      return next;
    });
  };

  // Auto-expand cliente of selected cotizacion
  const selectedCot = cotizaciones.find(c => c.id === selectedId);
  const autoExpanded = useMemo(() => {
    const s = new Set(expandedClientes);
    if (selectedCot) s.add(selectedCot.cliente);
    return s;
  }, [expandedClientes, selectedCot]);

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-bold text-slate-800">Cotizaciones</p>
            <p className="text-xs text-slate-400">{cotizaciones.length} en total</p>
          </div>
          <button
            onClick={onNew}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line" />
            Nueva
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center pointer-events-none">
            <i className="ri-search-line text-xs text-slate-400" />
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente o período..."
            className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-400 text-slate-600 placeholder-slate-300"
          />
        </div>

        {/* Estado filter */}
        <div className="flex gap-1 flex-wrap">
          {(['todas','vigente','borrador','cerrada','historica'] as FilterEstado[]).map(e => (
            <button
              key={e}
              onClick={() => setFilterEstado(e)}
              className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                filterEstado === e
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {e === 'todas' ? 'Todas' : ESTADO_V2_CONFIG[e as Exclude<FilterEstado,'todas'>].label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 px-4 text-center">
            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100">
              <i className="ri-file-list-3-line text-lg text-slate-400" />
            </div>
            <p className="text-xs text-slate-400">
              {search || filterEstado !== 'todas' ? 'Sin resultados' : 'Crea tu primera cotización'}
            </p>
          </div>
        ) : (
          groups.map(({ cliente, cotizaciones: cots }) => {
            const isExpanded = autoExpanded.has(cliente);
            const hasSelected = cots.some(c => c.id === selectedId);
            return (
              <div key={cliente} className="border-b border-slate-50 last:border-0">
                {/* Cliente header */}
                <button
                  onClick={() => toggleCliente(cliente)}
                  className={`w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-slate-50 transition-colors cursor-pointer ${
                    hasSelected ? 'bg-emerald-50/50' : ''
                  }`}
                >
                  <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 flex-shrink-0">
                    <i className="ri-building-4-line text-xs text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate">{cliente}</p>
                    <p className="text-xs text-slate-400">{cots.length} cotización{cots.length !== 1 ? 'es' : ''}</p>
                  </div>
                  <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                    <i className={isExpanded ? 'ri-arrow-up-s-line text-xs text-slate-400' : 'ri-arrow-down-s-line text-xs text-slate-400'} />
                  </div>
                </button>

                {/* Cotizaciones del cliente */}
                {isExpanded && (
                  <div className="pb-1">
                    {cots.map(c => {
                      const cfg = ESTADO_V2_CONFIG[c.estado];
                      const isActive = c.id === selectedId;
                      return (
                        <div
                          key={c.id}
                          onClick={() => onSelect(c)}
                          className={`flex items-start gap-2.5 px-4 py-2.5 cursor-pointer transition-all group ${
                            isActive
                              ? 'bg-emerald-50 border-l-2 border-emerald-500 ml-0'
                              : 'hover:bg-slate-50 border-l-2 border-transparent ml-0'
                          }`}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${cfg.dot}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-semibold text-slate-700">
                                {MESES[c.mes - 1]} {c.anio}
                              </span>
                              <span className="text-xs text-slate-400">v{c.version}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${cfg.color}`}>
                                {cfg.label}
                              </span>
                              <span className="text-xs text-slate-400">{c.moneda}</span>
                              {c.total_general > 0 && (
                                <span className="text-xs font-semibold text-emerald-600">
                                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: c.moneda, maximumFractionDigits: 0 }).format(c.total_general)}
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button
                              onClick={e => { e.stopPropagation(); onDuplicate(c); }}
                              className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                              title="Duplicar cotización"
                            >
                              <i className="ri-file-copy-line text-xs" />
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
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
