import { useState, useMemo } from 'react';
import type { VariableDef, VarGroup } from '@/lib/formulaVariables';
import { GROUP_META } from '@/lib/formulaVariables';

interface VariablePickerProps {
  defs: VariableDef[];
  varMap: Record<string, number>;
  onInsert: (token: string) => void;
}

const GROUP_ORDER: VarGroup[] = ['inversiones', 'gastos_varios', 'mano_obra', 'volumenes', 'distribucion', 'distribucion_cubica', 'vol_distribucion', 'areas', 'factores', 'masivo'];

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(2) + 'K';
  return n.toFixed(2) || '0';
}

// ── Sub-group definitions for Volúmenes ─────────────────────────────────────
type VolSubGroup = 'todos' | 'prom_in' | 'prom_out' | 'recibidas' | 'despachadas' | 'porcentajes';

const VOL_SUBGROUPS: { id: VolSubGroup; label: string; icon: string; color: string }[] = [
  { id: 'todos',       label: 'Todos',        icon: 'ri-apps-line',               color: 'sky'    },
  { id: 'prom_in',     label: 'Prom. IN',     icon: 'ri-arrow-down-circle-line',  color: 'emerald'},
  { id: 'prom_out',    label: 'Prom. OUT',    icon: 'ri-arrow-up-circle-line',    color: 'amber'  },
  { id: 'recibidas',   label: 'Recibidas',    icon: 'ri-arrow-down-circle-line',  color: 'sky'    },
  { id: 'despachadas', label: 'Despachadas',  icon: 'ri-arrow-up-circle-line',    color: 'sky'    },
  { id: 'porcentajes', label: '% Despacho',   icon: 'ri-percent-line',            color: 'violet' },
];

function filterByVolSubGroup(defs: VariableDef[], sub: VolSubGroup): VariableDef[] {
  switch (sub) {
    case 'todos':       return defs;
    case 'prom_in':     return defs.filter(d => d.token.startsWith('VOL_PROM_IN_'));
    case 'prom_out':    return defs.filter(d => d.token.startsWith('VOL_PROM_OUT_'));
    case 'recibidas':   return defs.filter(d =>
      d.token === 'TOTAL_RECIBIDAS' || d.token === 'TOTAL_VOLUMENES' ||
      d.token.startsWith('VOL_REC_') || d.token.startsWith('SUM_VOL_')
    );
    case 'despachadas': return defs.filter(d =>
      d.token === 'TOTAL_DESPACHADAS' || d.token.startsWith('VOL_DES_')
    );
    case 'porcentajes': return defs.filter(d =>
      d.token.startsWith('VOL_PORC_') || d.token.startsWith('VOL_PROM_INOUT_') ||
      d.token === 'VOL_PROM_INOUT_TOTAL'
    );
    default:            return defs;
  }
}

// ── Sub-group definitions for Mano de Obra ───────────────────────────────────
type MoSubGroup = 'todos' | 'dist_area' | 'dist_sec' | 'dist_tipo' | 'dist_emp' | 'salarios';

const MO_SUBGROUPS: { id: MoSubGroup; label: string; icon: string; prefix?: string }[] = [
  { id: 'todos',      label: 'Todos',           icon: 'ri-apps-line'                                    },
  { id: 'dist_area',  label: 'Dist. Área',      icon: 'ri-layout-grid-line',        prefix: 'MO_DIST_AREA_'  },
  { id: 'dist_sec',   label: 'Dist. Sección',   icon: 'ri-organization-chart',      prefix: 'MO_DIST_SEC_'   },
  { id: 'dist_tipo',  label: 'Dist. Tipo',      icon: 'ri-user-settings-line',      prefix: 'MO_DIST_TIPO_'  },
  { id: 'dist_emp',   label: 'Dist. Empleado',  icon: 'ri-user-line',               prefix: 'MO_DIST_EMP_'   },
  { id: 'salarios',   label: 'Salarios',        icon: 'ri-money-dollar-circle-line', prefix: 'SUM_MO_'       },
];

function filterByMoSubGroup(defs: VariableDef[], sub: MoSubGroup): VariableDef[] {
  if (sub === 'todos') return defs;
  const found = MO_SUBGROUPS.find(s => s.id === sub);
  if (!found?.prefix) return defs;
  // For 'salarios' include TOTAL_MANO_OBRA, MO_EMP_COUNT and MO_DIST_TOTAL too
  if (sub === 'salarios') {
    return defs.filter(d =>
      d.token.startsWith('SUM_MO_') ||
      d.token === 'TOTAL_MANO_OBRA' ||
      d.token === 'MO_EMP_COUNT' ||
      d.token === 'MO_DIST_TOTAL'
    );
  }
  return defs.filter(d => d.token.startsWith(found.prefix!));
}

// ── Sub-group definitions for Vol. Distribución ────────────────────────────
type VolDistSubGroup = 'todos' | 'inbound' | 'outbound' | 'total' | 'ajustado';

const VOLDIST_SUBGROUPS: { id: VolDistSubGroup; label: string; icon: string; color: string }[] = [
  { id: 'todos',    label: 'Todos',        icon: 'ri-apps-line',              color: 'teal'    },
  { id: 'inbound',  label: 'Inbound',      icon: 'ri-arrow-down-circle-line', color: 'emerald' },
  { id: 'outbound', label: 'Outbound',     icon: 'ri-arrow-up-circle-line',   color: 'sky'     },
  { id: 'total',    label: 'Total IN+OUT', icon: 'ri-pie-chart-2-line',       color: 'amber'   },
  { id: 'ajustado', label: 'Ajustado (sin ZF)', icon: 'ri-filter-off-line',   color: 'lime'    },
];

// Tokens de inbound individual (% dentro de inbound, no del total combinado)
const INBOUND_DIRECT_TOKENS = new Set([
  'VOLDIST_INBOUND_TOTAL',
  'VOLDIST_RECIBO_NACIONALIZADO',
  'VOLDIST_RECIBO_NO_NACIONALIZADO',
  'VOLDIST_RECIBO_PESADO',
]);

// Tokens de outbound individual
const OUTBOUND_DIRECT_TOKENS = new Set([
  'VOLDIST_OUTBOUND_TOTAL',
  'VOLDIST_DESPACHO_NACIONALIZADO',
  'VOLDIST_DESPACHO_NO_NACIONALIZADO',
  'VOLDIST_DESPACHO_MENUDENCIA',
  'VOLDIST_DESPACHO_PESADO',
]);

function filterByVolDistSubGroup(defs: VariableDef[], sub: VolDistSubGroup): VariableDef[] {
  const isAjustada = (token: string) => token.startsWith('VOLDIST_AJUSTADA_');
  // Non-prefixed ajustada tokens: RECIBO_* → inbound, DESPACHO_* → outbound
  const isAjustadaIn = (token: string) => isAjustada(token) && token.includes('RECIBO_');
  const isAjustadaOut = (token: string) => isAjustada(token) && token.includes('DESPACHO_');
  switch (sub) {
    case 'todos':    return defs;
    case 'ajustado': return defs.filter(d => isAjustada(d.token));
    case 'inbound':  return defs.filter(d =>
      (!isAjustada(d.token) && (d.token.startsWith('VOLDIST_IN_') || INBOUND_DIRECT_TOKENS.has(d.token))) ||
      (isAjustada(d.token) && (d.token.startsWith('VOLDIST_AJUSTADA_IN_') || isAjustadaIn(d.token) || ['VOLDIST_AJUSTADA_INBOUND_TOTAL_PCT', 'VOLDIST_AJUSTADA_TOTAL_INBOUND'].includes(d.token)))
    );
    case 'outbound': return defs.filter(d =>
      (!isAjustada(d.token) && (d.token.startsWith('VOLDIST_OUT_') || OUTBOUND_DIRECT_TOKENS.has(d.token))) ||
      (isAjustada(d.token) && (d.token.startsWith('VOLDIST_AJUSTADA_OUT_') || isAjustadaOut(d.token) || ['VOLDIST_AJUSTADA_OUTBOUND_TOTAL_PCT', 'VOLDIST_AJUSTADA_TOTAL_OUTBOUND'].includes(d.token)))
    );
    case 'total':    return defs.filter(d => d.token.startsWith('VOLDIST_TOTAL_') || d.token.startsWith('VOLDIST_AJUSTADA_TOTAL_') || d.token === 'VOLDIST_AJUSTADA_COMBINADO_TOTAL_PCT');
    default:         return defs;
  }
}

// ── Sub-group definitions for Vol. Masivos ───────────────────────────────
type MasivoSubGroup = 'todos' | 'globales' | 'zonas' | 'articulos';

const MASIVO_SUBGROUPS: { id: MasivoSubGroup; label: string; icon: string; color: string }[] = [
  { id: 'todos',     label: 'Todos',      icon: 'ri-apps-line',          color: 'slate'   },
  { id: 'globales',  label: 'Globales',   icon: 'ri-global-line',        color: 'slate'   },
  { id: 'zonas',     label: 'Zonas',      icon: 'ri-map-pin-line',       color: 'slate'   },
  { id: 'articulos', label: 'Artículos',  icon: 'ri-price-tag-3-line',   color: 'slate'   },
];

function filterByMasivoSubGroup(defs: VariableDef[], sub: MasivoSubGroup): VariableDef[] {
  switch (sub) {
    case 'todos':     return defs;
    case 'globales':  return defs.filter(d => d.token.startsWith('MASIVO_TOTAL_') || d.token.startsWith('MASIVO_PROM_'));
    case 'zonas':     return defs.filter(d => d.token.startsWith('MASIVO_ZONA_'));
    case 'articulos': return defs.filter(d => d.token.startsWith('MASIVO_ART_'));
    default:          return defs;
  }
}

export default function VariablePicker({ defs, varMap, onInsert }: VariablePickerProps) {
  const [activeGroup, setActiveGroup] = useState<VarGroup>(GROUP_ORDER[0]);
  const [search, setSearch] = useState('');
  const [moSubGroup, setMoSubGroup] = useState<MoSubGroup>('todos');
  const [volSubGroup, setVolSubGroup] = useState<VolSubGroup>('todos');
  const [volDistSubGroup, setVolDistSubGroup] = useState<VolDistSubGroup>('todos');
  const [masivoSubGroup, setMasivoSubGroup] = useState<MasivoSubGroup>('todos');

  const grouped = useMemo(() => {
    const map: Partial<Record<VarGroup, VariableDef[]>> = {};
    for (const def of defs) {
      if (!map[def.group]) map[def.group] = [];
      map[def.group]!.push(def);
    }
    return map;
  }, [defs]);

  const visibleGroups = GROUP_ORDER.filter(g => (grouped[g]?.length ?? 0) > 0);

  // Sub-group counts for volumenes
  const volSubGroupCounts = useMemo(() => {
    const volDefs = grouped['volumenes'] ?? [];
    const counts: Record<VolSubGroup, number> = { todos: volDefs.length, prom_in: 0, prom_out: 0, recibidas: 0, despachadas: 0, porcentajes: 0 };
    volDefs.forEach(d => {
      if (d.token.startsWith('VOL_PROM_IN_'))          counts.prom_in++;
      else if (d.token.startsWith('VOL_PROM_OUT_'))     counts.prom_out++;
      else if (d.token === 'TOTAL_RECIBIDAS' || d.token === 'TOTAL_VOLUMENES' || d.token.startsWith('VOL_REC_') || d.token.startsWith('SUM_VOL_')) counts.recibidas++;
      else if (d.token === 'TOTAL_DESPACHADAS' || d.token.startsWith('VOL_DES_')) counts.despachadas++;
      else if (d.token.startsWith('VOL_PORC_') || d.token.startsWith('VOL_PROM_INOUT_') || d.token === 'VOL_PROM_INOUT_TOTAL') counts.porcentajes++;
    });
    return counts;
  }, [grouped]);

  // Sub-group counts for mano_obra
  const moSubGroupCounts = useMemo(() => {
    const moDefs = grouped['mano_obra'] ?? [];
    const counts: Record<MoSubGroup, number> = { todos: moDefs.length, dist_area: 0, dist_sec: 0, dist_tipo: 0, dist_emp: 0, salarios: 0 };
    moDefs.forEach(d => {
      if (d.token.startsWith('MO_DIST_AREA_'))       counts.dist_area++;
      else if (d.token.startsWith('MO_DIST_SEC_'))   counts.dist_sec++;
      else if (d.token.startsWith('MO_DIST_TIPO_'))  counts.dist_tipo++;
      else if (d.token.startsWith('MO_DIST_EMP_'))   counts.dist_emp++;
      else if (d.token.startsWith('SUM_MO_') || ['TOTAL_MANO_OBRA', 'MO_EMP_COUNT', 'MO_DIST_TOTAL'].includes(d.token)) counts.salarios++;
    });
    return counts;
  }, [grouped]);

  // Sub-group counts for vol_distribucion
  const volDistSubGroupCounts = useMemo(() => {
    const vdDefs = grouped['vol_distribucion'] ?? [];
    const counts: Record<VolDistSubGroup, number> = { todos: vdDefs.length, inbound: 0, outbound: 0, total: 0, ajustado: 0 };
    const isAjustada = (t: string) => t.startsWith('VOLDIST_AJUSTADA_');
    const isAjustadaIn = (t: string) => isAjustada(t) && t.includes('RECIBO_');
    const isAjustadaOut = (t: string) => isAjustada(t) && t.includes('DESPACHO_');
    vdDefs.forEach(d => {
      const token = d.token;
      const isAj = token.startsWith('VOLDIST_AJUSTADA_');
      if (isAj) {
        counts.ajustado++;
        if (token.startsWith('VOLDIST_AJUSTADA_TOTAL_'))  counts.total++;
        else if (token.startsWith('VOLDIST_AJUSTADA_IN_') || isAjustadaIn(token) || ['VOLDIST_AJUSTADA_INBOUND_TOTAL_PCT', 'VOLDIST_AJUSTADA_TOTAL_INBOUND'].includes(token)) counts.inbound++;
        else if (token.startsWith('VOLDIST_AJUSTADA_OUT_') || isAjustadaOut(token) || ['VOLDIST_AJUSTADA_OUTBOUND_TOTAL_PCT', 'VOLDIST_AJUSTADA_TOTAL_OUTBOUND'].includes(token)) counts.outbound++;
      } else {
        if (token.startsWith('VOLDIST_TOTAL_'))                                        counts.total++;
        else if (token.startsWith('VOLDIST_IN_') || INBOUND_DIRECT_TOKENS.has(token))  counts.inbound++;
        else if (token.startsWith('VOLDIST_OUT_') || OUTBOUND_DIRECT_TOKENS.has(token)) counts.outbound++;
      }
    });
    return counts;
  }, [grouped]);

  // Sub-group counts for masivo
  const masivoSubGroupCounts = useMemo(() => {
    const mDefs = grouped['masivo'] ?? [];
    const counts: Record<MasivoSubGroup, number> = { todos: mDefs.length, globales: 0, zonas: 0, articulos: 0 };
    mDefs.forEach(d => {
      if (d.token.startsWith('MASIVO_TOTAL_') || d.token.startsWith('MASIVO_PROM_')) counts.globales++;
      else if (d.token.startsWith('MASIVO_ZONA_')) counts.zonas++;
      else if (d.token.startsWith('MASIVO_ART_')) counts.articulos++;
    });
    return counts;
  }, [grouped]);

  const filteredDefs = useMemo(() => {
    if (search.trim()) {
      return defs.filter(d =>
        d.label.toLowerCase().includes(search.toLowerCase()) ||
        d.token.toLowerCase().includes(search.toLowerCase())
      );
    }
    const groupDefs = grouped[activeGroup] ?? [];
    if (activeGroup === 'mano_obra') {
      return filterByMoSubGroup(groupDefs, moSubGroup);
    }
    if (activeGroup === 'volumenes') {
      return filterByVolSubGroup(groupDefs, volSubGroup);
    }
    if (activeGroup === 'vol_distribucion') {
      return filterByVolDistSubGroup(groupDefs, volDistSubGroup);
    }
    if (activeGroup === 'masivo') {
      return filterByMasivoSubGroup(groupDefs, masivoSubGroup);
    }
    return groupDefs;
  }, [defs, search, activeGroup, grouped, moSubGroup, volSubGroup, volDistSubGroup, masivoSubGroup]);

  const activeGroupMeta = GROUP_META[activeGroup];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Search */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="w-4 h-4 flex items-center justify-center text-slate-400">
            <i className="ri-search-line text-sm" />
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar variable..."
            className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600 cursor-pointer">
              <i className="ri-close-line text-sm" />
            </button>
          )}
        </div>
      </div>

      {/* Group tabs — only when not searching */}
      {!search && (
        <div className="flex gap-1 px-3 pb-2 flex-shrink-0 overflow-x-auto">
          {visibleGroups.map(g => {
            const meta = GROUP_META[g];
            const isActive = g === activeGroup;
            return (
              <button
                key={g}
                onClick={() => { setActiveGroup(g); setMoSubGroup('todos'); setVolSubGroup('todos'); setVolDistSubGroup('todos'); }}
                title={meta.label}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                <div className="w-3 h-3 flex items-center justify-center">
                  <i className={meta.icon} />
                </div>
                <span className="hidden sm:inline">{meta.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Group header when not searching */}
      {!search && (
        <div className={`mx-3 px-3 py-1.5 rounded-lg flex items-center gap-2 mb-1 flex-shrink-0`}>
          <div className="w-4 h-4 flex items-center justify-center">
            <i className={`${activeGroupMeta.icon} text-sm ${activeGroupMeta.color}`} />
          </div>
          <span className={`text-xs font-semibold ${activeGroupMeta.color}`}>{activeGroupMeta.label}</span>
          <span className="text-xs text-slate-400 ml-auto">
            {filteredDefs.length} variables
          </span>
        </div>
      )}

      {/* ── Mano de Obra sub-group pills ───────────────────────────────── */}
      {!search && activeGroup === 'mano_obra' && (
        <div className="px-3 pb-2 flex-shrink-0">
          <div className="flex gap-1 flex-wrap">
            {MO_SUBGROUPS.map(sg => {
              const count = moSubGroupCounts[sg.id];
              if (sg.id !== 'todos' && count === 0) return null;
              const isActive = moSubGroup === sg.id;
              return (
                <button
                  key={sg.id}
                  onClick={() => setMoSubGroup(sg.id)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-teal-500 text-white'
                      : 'bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200'
                  }`}
                >
                  <div className="w-3 h-3 flex items-center justify-center">
                    <i className={sg.icon} />
                  </div>
                  {sg.label}
                  <span className={`ml-0.5 text-xs tabular-nums ${isActive ? 'text-teal-100' : 'text-teal-400'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Distribution summary banner when a dist sub-group is active */}
          {(['dist_area', 'dist_sec', 'dist_tipo', 'dist_emp'] as MoSubGroup[]).includes(moSubGroup) && filteredDefs.length > 0 && (
            <div className="mt-2 px-3 py-2 bg-teal-50 border border-teal-100 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 flex items-center justify-center">
                  <i className="ri-pie-chart-line text-teal-500 text-xs" />
                </div>
                <p className="text-xs text-teal-700">
                  <span className="font-semibold">{filteredDefs.length}</span>
                  {moSubGroup === 'dist_area' && ' áreas con distribución'}
                  {moSubGroup === 'dist_sec' && ' secciones con distribución'}
                  {moSubGroup === 'dist_tipo' && ' tipos con distribución'}
                  {moSubGroup === 'dist_emp' && ' empleados con distribución'}
                  {' · Total Dist: '}
                  <span className="font-semibold font-mono">
                    {fmt(filteredDefs.reduce((s, d) => s + (varMap[d.token] ?? 0), 0))}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Empty state for distribution sub-groups */}
          {(['dist_area', 'dist_sec', 'dist_tipo', 'dist_emp'] as MoSubGroup[]).includes(moSubGroup) && filteredDefs.length === 0 && (
            <div className="mt-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
              <p className="text-xs text-slate-500 text-center">
                Sin datos importados · Ve a <span className="font-semibold">Mano de Obra → Empleados importados</span> y carga un archivo
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Volúmenes sub-group pills ──────────────────────────────────── */}
      {!search && activeGroup === 'volumenes' && (
        <div className="px-3 pb-2 flex-shrink-0">
          <div className="flex gap-1 flex-wrap">
            {VOL_SUBGROUPS.map(sg => {
              const count = volSubGroupCounts[sg.id];
              if (sg.id !== 'todos' && count === 0) return null;
              const isActive = volSubGroup === sg.id;
              const colorMap: Record<string, string> = {
                sky:     isActive ? 'bg-sky-500 text-white'     : 'bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200',
                emerald: isActive ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200',
                amber:   isActive ? 'bg-amber-500 text-white'   : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200',
                violet:  isActive ? 'bg-violet-500 text-white'  : 'bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200',
              };
              const cls = colorMap[sg.color] ?? colorMap.sky;
              const countCls = isActive ? 'opacity-75' : 'opacity-60';
              return (
                <button
                  key={sg.id}
                  onClick={() => setVolSubGroup(sg.id)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${cls}`}
                >
                  <div className="w-3 h-3 flex items-center justify-center">
                    <i className={sg.icon} />
                  </div>
                  {sg.label}
                  <span className={`ml-0.5 text-xs tabular-nums ${countCls}`}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Banner informativo para Prom. IN y Prom. OUT */}
          {(volSubGroup === 'prom_in' || volSubGroup === 'prom_out') && filteredDefs.length > 0 && (
            <div className={`mt-2 px-3 py-2 border rounded-lg ${volSubGroup === 'prom_in' ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 flex items-center justify-center">
                  <i className={`${volSubGroup === 'prom_in' ? 'ri-arrow-down-circle-line text-emerald-500' : 'ri-arrow-up-circle-line text-amber-500'} text-xs`} />
                </div>
                <p className={`text-xs ${volSubGroup === 'prom_in' ? 'text-emerald-700' : 'text-amber-700'}`}>
                  <span className="font-semibold">{filteredDefs.length - 2 > 0 ? filteredDefs.length - 2 : filteredDefs.length}</span> clientes
                  {' · '}
                  {volSubGroup === 'prom_in' ? 'Promedio mensual recibidas' : 'Promedio mensual despachadas'}
                  {' por cliente · Valor no sumado'}
                </p>
              </div>
            </div>
          )}

          {(volSubGroup === 'prom_in' || volSubGroup === 'prom_out') && filteredDefs.length === 0 && (
            <div className="mt-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
              <p className="text-xs text-slate-500 text-center">
                Sin datos de volúmenes · Ve a <span className="font-semibold">Volúmenes</span> y carga un Excel
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Vol. Distribución sub-group pills ─────────────────────────── */}
      {!search && activeGroup === 'vol_distribucion' && (
        <div className="px-3 pb-2 flex-shrink-0">
          <div className="flex gap-1 flex-wrap">
            {VOLDIST_SUBGROUPS.map(sg => {
              const count = volDistSubGroupCounts[sg.id];
              if (sg.id !== 'todos' && count === 0) return null;
              const isActive = volDistSubGroup === sg.id;
              const colorMap: Record<string, string> = {
                teal:    isActive ? 'bg-teal-500 text-white'    : 'bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200',
                emerald: isActive ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200',
                sky:     isActive ? 'bg-sky-500 text-white'     : 'bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200',
                amber:   isActive ? 'bg-amber-500 text-white'   : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200',
                lime:    isActive ? 'bg-lime-500 text-white'    : 'bg-lime-50 text-lime-700 hover:bg-lime-100 border border-lime-200',
              };
              const cls = colorMap[sg.color] ?? colorMap.teal;
              const countCls = isActive ? 'opacity-75' : 'opacity-60';
              return (
                <button
                  key={sg.id}
                  onClick={() => setVolDistSubGroup(sg.id)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${cls}`}
                >
                  <div className="w-3 h-3 flex items-center justify-center">
                    <i className={sg.icon} />
                  </div>
                  {sg.label}
                  <span className={`ml-0.5 text-xs tabular-nums ${countCls}`}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Masivo sub-group pills ────────────────────────────────────── */}
      {!search && activeGroup === 'masivo' && (
        <div className="px-3 pb-2 flex-shrink-0">
          <div className="flex gap-1 flex-wrap">
            {MASIVO_SUBGROUPS.map(sg => {
              const count = masivoSubGroupCounts[sg.id];
              if (sg.id !== 'todos' && count === 0) return null;
              const isActive = masivoSubGroup === sg.id;
              const cls = isActive
                ? 'bg-slate-700 text-white'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200';
              return (
                <button
                  key={sg.id}
                  onClick={() => setMasivoSubGroup(sg.id)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${cls}`}
                >
                  <div className="w-3 h-3 flex items-center justify-center">
                    <i className={sg.icon} />
                  </div>
                  {sg.label}
                  <span className={`ml-0.5 text-xs tabular-nums ${isActive ? 'opacity-75' : 'opacity-60'}`}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Variable list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1 min-h-0">
        {filteredDefs.length === 0 && !(activeGroup === 'mano_obra' && (['dist_area', 'dist_sec', 'dist_tipo', 'dist_emp'] as MoSubGroup[]).includes(moSubGroup)) && !(activeGroup === 'volumenes' && (['prom_in', 'prom_out'] as VolSubGroup[]).includes(volSubGroup)) ? (
          <div className="text-center py-8">
            <div className="w-8 h-8 flex items-center justify-center mx-auto text-slate-300 mb-2">
              <i className="ri-search-line text-2xl" />
            </div>
            <p className="text-xs text-slate-400">
              {search ? 'Sin resultados para tu búsqueda' : 'Sin variables disponibles en este módulo'}
            </p>
          </div>
        ) : (
          filteredDefs.map(def => {
            const val = varMap[def.token] ?? 0;
            const isDistVar = def.token.startsWith('MO_DIST_AREA_') || def.token.startsWith('MO_DIST_SEC_') || def.token.startsWith('MO_DIST_TIPO_') || def.token.startsWith('MO_DIST_EMP_');
            return (
              <button
                key={def.token}
                onClick={() => onInsert(`{${def.token}}`)}
                title={`Insertar {${def.token}}\n${def.description}`}
                className="w-full flex items-center gap-3 px-3 py-2.5 bg-white border border-slate-200 rounded-lg hover:border-teal-300 hover:bg-teal-50/30 transition-all cursor-pointer text-left group"
              >
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  <i className={`${def.icon} text-sm ${GROUP_META[def.group].color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate group-hover:text-slate-900">{def.label}</p>
                  <p className="text-xs text-slate-400 font-mono truncate mt-0.5">{`{${def.token}}`}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className={`text-xs font-semibold tabular-nums ${isDistVar && val > 0 ? 'text-teal-600' : 'text-slate-600'}`}>
                    {isDistVar ? val.toFixed(2) : fmt(val)}
                  </p>
                  <div className="w-4 h-4 flex items-center justify-center ml-auto text-slate-300 group-hover:text-teal-500 transition-colors mt-0.5">
                    <i className="ri-add-circle-line text-sm" />
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
