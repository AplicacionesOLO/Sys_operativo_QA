import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { supabase } from '@/lib/supabase';
import type { VolDistribucion } from '@/types/vol_distribucion';
import { cascadeRenameTokens, volDistRenamePairs } from '@/lib/formulaTokenRename';
import { COLOR_CONFIG } from '@/types/vol_distribucion';
import VolDistribucionChart from './components/VolDistribucionChart';
import VolDistribucionTotal from './components/VolDistribucionTotal';
import VolDistribucionAjustada from './components/VolDistribucionAjustada';

type CategoriaTab = 'inbound' | 'outbound';
type MainTab = 'segmentos' | 'total' | 'ajustada';

function fmt(n: number) {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
}

const CAT_DB: Record<CategoriaTab, string> = { inbound: 'Inbound', outbound: 'Outbound' };

const SEGMENTOS_PREDEFINIDOS: Record<CategoriaTab, { nombre: string; color: string; icono: string }[]> = {
  inbound: [
    { nombre: 'Recibo Nacionalizado',     color: 'emerald', icono: 'ri-arrow-down-circle-line' },
    { nombre: 'Recibo No Nacionalizado',  color: 'sky',     icono: 'ri-arrow-down-circle-line' },
    { nombre: 'Recibo Pesado',            color: 'amber',   icono: 'ri-arrow-down-circle-line' },
  ],
  outbound: [
    { nombre: 'Despacho Nacionalizado',    color: 'emerald', icono: 'ri-arrow-up-circle-line' },
    { nombre: 'Despacho No Nacionalizado', color: 'sky',     icono: 'ri-arrow-up-circle-line' },
    { nombre: 'Despacho Menudencia',       color: 'amber',   icono: 'ri-arrow-up-circle-line' },
    { nombre: 'Despacho Pesado',           color: 'orange',  icono: 'ri-arrow-up-circle-line' },
  ],
};

export default function VolDistribucionPage() {
  const [items, setItems] = useState<VolDistribucion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<CategoriaTab>('outbound');
  const [mainTab, setMainTab] = useState<MainTab>('segmentos');
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('volumen_distribucion')
      .select('*')
      .order('orden');

    let currentItems = (data as VolDistribucion[]) ?? [];

    const allPredefined = [
      ...SEGMENTOS_PREDEFINIDOS.inbound.map(s => ({ ...s, cat: 'Inbound' })),
      ...SEGMENTOS_PREDEFINIDOS.outbound.map(s => ({ ...s, cat: 'Outbound' })),
    ];
    const existingNames = new Set(currentItems.map(i => i.nombre));
    const toCreate = allPredefined.filter(s => !existingNames.has(s.nombre));

    if (toCreate.length > 0) {
      const inserts = toCreate.map((s, idx) => ({
        nombre: s.nombre,
        descripcion: '',
        porcentaje: 0,
        porcentaje_inbound: 0,
        porcentaje_outbound: 0,
        categoria: s.cat,
        color: s.color,
        icono: s.icono,
        orden: currentItems.length + idx,
        is_active: true,
        unidades: 0,
      }));
      const { data: newItems } = await supabase.from('volumen_distribucion').insert(inserts).select();
      if (newItems) {
        currentItems = [...currentItems, ...(newItems as VolDistribucion[])];
      }
    }

    setItems(currentItems);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const debouncedSave = useCallback((id: string, fields: Partial<VolDistribucion>) => {
    const existing = saveTimers.current.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      setSaving(prev => new Set(prev).add(id));
      await supabase
        .from('volumen_distribucion')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id);
      setSaving(prev => { const s = new Set(prev); s.delete(id); return s; });
      saveTimers.current.delete(id);
    }, 500);
    saveTimers.current.set(id, timer);
  }, []);

  const handleUpdate = useCallback((id: string, fields: Partial<VolDistribucion>) => {
    // Cascade-rename VOLDIST_* tokens if nombre changes
    if (fields.nombre !== undefined) {
      const oldItem = items.find(i => i.id === id);
      if (oldItem && oldItem.nombre !== fields.nombre) {
        cascadeRenameTokens(volDistRenamePairs(oldItem.nombre, fields.nombre));
      }
    }
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...fields } : i));
    debouncedSave(id, fields);
  }, [debouncedSave, items]);

  const recalcPorcentajes = useCallback((updatedItems: VolDistribucion[], cat: CategoriaTab) => {
    const catDB = CAT_DB[cat];
    const catItemsLocal = updatedItems.filter(i => i.categoria === catDB);
    const totalUds = catItemsLocal.reduce((s, i) => s + (i.unidades ?? 0), 0);
    if (totalUds === 0) return updatedItems;

    const recalculated = updatedItems.map(i => {
      if (i.categoria !== catDB) return i;
      const pct = totalUds > 0 ? parseFloat(((i.unidades / totalUds) * 100).toFixed(4)) : 0;
      return cat === 'inbound'
        ? { ...i, porcentaje_inbound: pct }
        : { ...i, porcentaje_outbound: pct };
    });

    setItems(recalculated);

    Promise.all(
      recalculated.filter(i => i.categoria === catDB).map(i =>
        supabase.from('volumen_distribucion')
          .update({
            porcentaje_inbound: i.porcentaje_inbound,
            porcentaje_outbound: i.porcentaje_outbound,
            updated_at: new Date().toISOString(),
          })
          .eq('id', i.id)
      )
    );
    return recalculated;
  }, []);

  const handleUpdateUnidades = useCallback((id: string, value: number) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const updated = items.map(i => i.id === id ? { ...i, unidades: value } : i);
    setItems(updated);
    debouncedSave(id, { unidades: value });
    const catTab: CategoriaTab = item.categoria === 'Inbound' ? 'inbound' : 'outbound';
    const existing = saveTimers.current.get(`recalc_${id}`);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => recalcPorcentajes(updated, catTab), 600);
    saveTimers.current.set(`recalc_${id}`, t);
  }, [items, debouncedSave, recalcPorcentajes]);

  const handleUpdatePct = useCallback((id: string, value: number) => {
    const field = activeTab === 'inbound' ? 'porcentaje_inbound' : 'porcentaje_outbound';
    handleUpdate(id, { [field]: value } as Partial<VolDistribucion>);
  }, [handleUpdate, activeTab]);

  const handleNormalize = useCallback(async () => {
    const catDB = CAT_DB[activeTab];
    const catItemsLocal = items.filter(i => i.categoria === catDB && i.is_active);
    const total = catItemsLocal.reduce((s, i) => s + (activeTab === 'inbound' ? i.porcentaje_inbound : i.porcentaje_outbound), 0);
    if (total === 0) return;
    const factor = 100 / total;
    const field = activeTab === 'inbound' ? 'porcentaje_inbound' : 'porcentaje_outbound';
    const updated = items.map(i =>
      i.categoria === catDB && i.is_active
        ? { ...i, [field]: parseFloat((i[field as keyof VolDistribucion] as number * factor).toFixed(4)) }
        : i
    );
    setItems(updated);
    await Promise.all(
      updated.filter(i => i.categoria === catDB && i.is_active).map(i =>
        supabase.from('volumen_distribucion').update({
          porcentaje_inbound: i.porcentaje_inbound,
          porcentaje_outbound: i.porcentaje_outbound,
          updated_at: new Date().toISOString(),
        }).eq('id', i.id)
      )
    );
  }, [items, activeTab]);

  const handleRecalcAll = useCallback(() => {
    recalcPorcentajes(items, activeTab);
  }, [items, activeTab, recalcPorcentajes]);

  const catItems = useMemo(() => items.filter(i => i.categoria === CAT_DB[activeTab]), [items, activeTab]);
  const totalUdsCat = useMemo(() => catItems.reduce((s, i) => s + (i.unidades ?? 0), 0), [catItems]);
  const totalPctInbound = useMemo(() => items.filter(i => i.categoria === 'Inbound' && i.is_active).reduce((s, i) => s + i.porcentaje_inbound, 0), [items]);
  const totalPctOutbound = useMemo(() => items.filter(i => i.categoria === 'Outbound' && i.is_active).reduce((s, i) => s + i.porcentaje_outbound, 0), [items]);

  const totalPct = activeTab === 'inbound' ? totalPctInbound : totalPctOutbound;
  const isOverflow = totalPct > 100.01;
  const isComplete = Math.abs(totalPct - 100) < 0.01;

  const tabConfig = {
    inbound:  { label: 'Inbound',  sublabel: 'Recibido',   icon: 'ri-arrow-down-circle-line', color: 'emerald', hex: '#10b981' },
    outbound: { label: 'Outbound', sublabel: 'Despachado', icon: 'ri-arrow-up-circle-line',   color: 'sky',     hex: '#0ea5e9' },
  };
  const currentTab = tabConfig[activeTab];

  if (loading) {
    return (
      <AppLayout title="Distribución de Volumen" subtitle="Cargando...">
        <div className="flex items-center justify-center py-32">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Distribución de Volumen"
      subtitle="Segmentos predefinidos por categoría · ingresa unidades y ajusta la distribución"
    >
      {/* ── Main tab switcher ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => setMainTab('segmentos')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              mainTab === 'segmentos' ? 'bg-white text-slate-800' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <div className="w-4 h-4 flex items-center justify-center">
              <i className="ri-equalizer-line text-sm" />
            </div>
            Segmentos
          </button>
          <button
            onClick={() => setMainTab('total')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              mainTab === 'total' ? 'bg-white text-slate-800' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <div className="w-4 h-4 flex items-center justify-center">
              <i className="ri-pie-chart-2-line text-sm" />
            </div>
            Distribución Total
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">IN + OUT</span>
          </button>
          <button
            onClick={() => setMainTab('ajustada')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              mainTab === 'ajustada' ? 'bg-white text-slate-800' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <div className="w-4 h-4 flex items-center justify-center">
              <i className="ri-filter-off-line text-sm" />
            </div>
            Distribución Ajustada
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-lime-100 text-lime-700 font-medium">Sin ZF</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <div className="w-4 h-4 flex items-center justify-center"><i className="ri-refresh-line text-sm" /></div>
            Actualizar
          </button>
          {mainTab === 'segmentos' && (
            <button
              onClick={handleRecalcAll}
              className="flex items-center gap-1.5 px-3 py-2 border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-sm font-medium cursor-pointer whitespace-nowrap"
            >
              <div className="w-4 h-4 flex items-center justify-center"><i className="ri-calculator-line text-sm" /></div>
              Recalcular %
            </button>
          )}
        </div>
      </div>

      {/* ── Distribución Total tab ────────────────────────────────────────── */}
      {mainTab === 'total' && (
        <VolDistribucionTotal items={items} onItemsChange={setItems} />
      )}

      {/* ── Distribución Ajustada tab ──────────────────────────────────────── */}
      {mainTab === 'ajustada' && (
        <VolDistribucionAjustada items={items} onItemsChange={setItems} />
      )}

      {/* ── Segmentos tab ─────────────────────────────────────────────────── */}
      {mainTab === 'segmentos' && (
        <div className="space-y-5">

          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Inbound (Recibido)',    value: `${totalPctInbound.toFixed(2)}%`,  icon: 'ri-arrow-down-circle-line', color: 'text-emerald-500', bg: 'bg-emerald-50', sub: `${items.filter(i => i.categoria === 'Inbound').length} segmentos` },
              { label: 'Outbound (Despachado)', value: `${totalPctOutbound.toFixed(2)}%`, icon: 'ri-arrow-up-circle-line',   color: 'text-sky-500',     bg: 'bg-sky-50',     sub: `${items.filter(i => i.categoria === 'Outbound').length} segmentos` },
              { label: 'Unidades activas',      value: fmt(totalUdsCat),                  icon: 'ri-swap-line',              color: 'text-amber-500',   bg: 'bg-amber-50',   sub: `${catItems.filter(i => i.is_active).length} segmentos activos` },
              { label: 'Categoría activa',      value: currentTab.label,                  icon: currentTab.icon,             color: `text-${currentTab.color}-500`, bg: `bg-${currentTab.color}-50`, sub: currentTab.sublabel },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-4">
                <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${card.bg} flex-shrink-0`}>
                  <i className={`${card.icon} text-xl ${card.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-400 leading-tight">{card.label}</p>
                  <p className="text-lg font-bold text-slate-800 leading-tight mt-0.5 tabular-nums">{card.value}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{card.sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Inbound / Outbound sub-tabs */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
              {(['inbound', 'outbound'] as CategoriaTab[]).map(tab => {
                const cfg = tabConfig[tab];
                const isActive = activeTab === tab;
                const tabTotal = tab === 'inbound' ? totalPctInbound : totalPctOutbound;
                const tabOverflow = tabTotal > 100.01;
                const tabComplete = Math.abs(tabTotal - 100) < 0.01;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      isActive ? 'bg-white text-slate-800' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <div className="w-5 h-5 flex items-center justify-center">
                      <i className={`${cfg.icon} text-base`} style={isActive ? { color: cfg.hex } : {}} />
                    </div>
                    {cfg.label}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                      isActive
                        ? tabOverflow ? 'bg-rose-100 text-rose-600' : tabComplete ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'
                        : 'bg-slate-200/60 text-slate-400'
                    }`}>
                      {tabTotal.toFixed(2)}%
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              {isOverflow && (
                <button
                  onClick={handleNormalize}
                  className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-equalizer-line text-sm" />
                  Normalizar a 100%
                </button>
              )}
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                <i className="ri-information-line text-slate-400 text-xs" />
                <span className="text-xs text-slate-500">
                  Tokens <span className="font-mono text-slate-700">{'{VOLDIST_...}'}</span> en fórmulas
                </span>
              </div>
            </div>
          </div>

          {/* Category banner */}
          <div
            className="rounded-xl border-2 px-5 py-4 flex items-center gap-4"
            style={{ borderColor: `${currentTab.hex}30`, backgroundColor: `${currentTab.hex}08` }}
          >
            <div
              className="w-12 h-12 flex items-center justify-center rounded-xl flex-shrink-0"
              style={{ backgroundColor: `${currentTab.hex}18` }}
            >
              <i className={`${currentTab.icon} text-2xl`} style={{ color: currentTab.hex }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-800">Distribución {currentTab.label}</h2>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ backgroundColor: `${currentTab.hex}20`, color: currentTab.hex }}
                >
                  {currentTab.sublabel}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isOverflow
                  ? `Total: ${totalPct.toFixed(2)}% — excede en ${(totalPct - 100).toFixed(2)}%`
                  : isComplete
                    ? 'Los porcentajes suman exactamente 100%'
                    : `Total asignado: ${totalPct.toFixed(2)}% — faltan ${(100 - totalPct).toFixed(2)}%`
                }
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="w-32 h-2 bg-white rounded-full overflow-hidden border border-slate-100">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(totalPct, 100)}%`, backgroundColor: isOverflow ? '#f43f5e' : currentTab.hex }}
                />
              </div>
              <span className={`text-xl font-bold tabular-nums ${isOverflow ? 'text-rose-600' : 'text-slate-700'}`}>
                {totalPct.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-0 border-b border-slate-100 bg-slate-50">
              {['Segmento', 'Unidades', '% Distribución', 'Token fórmula', ''].map((h, i) => (
                <div key={i} className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide ${i > 0 && i < 4 ? 'text-right' : ''} ${i === 4 ? 'w-20' : ''}`}>
                  {h}
                </div>
              ))}
            </div>

            {catItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-slate-100">
                  <i className="ri-pie-chart-line text-2xl text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-600">Sin segmentos</p>
                <p className="text-xs text-slate-400">Los segmentos se crean automáticamente al cargar</p>
              </div>
            ) : (
              catItems.map((item, idx) => {
                const cfg = COLOR_CONFIG[item.color ?? 'emerald'] ?? COLOR_CONFIG.emerald;
                const token = `VOLDIST_${item.nombre.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;
                const isSaving = saving.has(item.id);
                const pctValue = activeTab === 'inbound' ? item.porcentaje_inbound : item.porcentaje_outbound;
                const totalUdsCatLocal = catItems.reduce((s, i) => s + (i.unidades ?? 0), 0);
                const calcPct = totalUdsCatLocal > 0 ? parseFloat(((item.unidades / totalUdsCatLocal) * 100).toFixed(4)) : 0;
                const isManualOverride = Math.abs(pctValue - calcPct) > 0.1 && totalUdsCatLocal > 0;

                return (
                  <div
                    key={item.id}
                    className={`grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-0 border-b border-slate-50 last:border-0 transition-colors ${!item.is_active ? 'opacity-40' : 'hover:bg-slate-50/50'}`}
                  >
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0" style={{ backgroundColor: `${cfg.hex}18` }}>
                        <i className={`${item.icono} text-sm`} style={{ color: cfg.hex }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">{item.nombre}</p>
                        <p className="text-xs text-slate-400 mt-0.5">#{idx + 1} · {item.categoria}</p>
                      </div>
                      {isSaving && <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                    </div>

                    <div className="px-4 py-3 flex items-center justify-end">
                      <UnidadesInput value={item.unidades ?? 0} onChange={val => handleUpdateUnidades(item.id, val)} />
                    </div>

                    <div className="px-4 py-3 flex flex-col items-end justify-center gap-1">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={pctValue}
                          onChange={e => handleUpdatePct(item.id, parseFloat(e.target.value) || 0)}
                          className="w-20 text-sm font-bold border border-slate-200 rounded-lg px-2 py-1 text-right focus:outline-none focus:border-emerald-400 tabular-nums"
                          style={{ color: currentTab.hex }}
                        />
                        <span className="text-sm font-bold text-slate-400">%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(pctValue, 100)}%`, backgroundColor: currentTab.hex }} />
                      </div>
                      {isManualOverride && (
                        <button
                          onClick={() => handleUpdatePct(item.id, calcPct)}
                          className="text-xs text-amber-600 hover:text-amber-700 cursor-pointer whitespace-nowrap"
                        >
                          ↺ calc: {calcPct.toFixed(2)}%
                        </button>
                      )}
                    </div>

                    <div className="px-4 py-3 flex items-center justify-end">
                      <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded-md truncate max-w-full">
                        {`{${token}}`}
                      </span>
                    </div>

                    <div className="px-3 py-3 flex items-center justify-center gap-1 w-20">
                      <button
                        onClick={() => handleUpdate(item.id, { is_active: !item.is_active })}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${item.is_active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-100'}`}
                        title={item.is_active ? 'Desactivar' : 'Activar'}
                      >
                        <i className={`text-sm ${item.is_active ? 'ri-eye-line' : 'ri-eye-off-line'}`} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {catItems.length > 0 && (
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-0 bg-slate-50 border-t-2 border-slate-200">
                <div className="px-4 py-3 flex items-center">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Total {currentTab.label}</span>
                </div>
                <div className="px-4 py-3 text-right">
                  <span className="text-sm font-bold text-amber-600 tabular-nums">{fmt(totalUdsCat)}</span>
                  <p className="text-xs text-slate-400">unidades</p>
                </div>
                <div className="px-4 py-3 text-right">
                  <span className={`text-sm font-bold tabular-nums ${isOverflow ? 'text-rose-600' : isComplete ? 'text-emerald-600' : 'text-slate-700'}`}>
                    {totalPct.toFixed(2)}%
                  </span>
                  <p className="text-xs text-slate-400">{isComplete ? '✓ completo' : isOverflow ? '⚠ excede' : 'parcial'}</p>
                </div>
                <div className="px-4 py-3" />
                <div className="w-20" />
              </div>
            )}
          </div>

          {/* Sliders */}
          {catItems.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0" style={{ backgroundColor: `${currentTab.hex}18` }}>
                  <i className={`${currentTab.icon} text-sm`} style={{ color: currentTab.hex }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Ajuste fino — {currentTab.label}</p>
                  <p className="text-xs text-slate-400">Arrastra los sliders para ajustar manualmente la distribución {currentTab.sublabel.toLowerCase()}</p>
                </div>
              </div>
              <div className="space-y-4">
                {catItems.filter(i => i.is_active).map(item => {
                  const cfg = COLOR_CONFIG[item.color ?? 'emerald'] ?? COLOR_CONFIG.emerald;
                  const pctValue = activeTab === 'inbound' ? item.porcentaje_inbound : item.porcentaje_outbound;
                  const totalUdsCatLocal = catItems.reduce((s, i) => s + (i.unidades ?? 0), 0);
                  const calcPct = totalUdsCatLocal > 0 ? parseFloat(((item.unidades / totalUdsCatLocal) * 100).toFixed(4)) : 0;

                  return (
                    <div key={item.id} className="flex items-center gap-4">
                      <div className="w-40 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.hex }} />
                          <span className="text-sm font-semibold text-slate-700 truncate">{item.nombre}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 pl-4 tabular-nums">{fmt(item.unidades ?? 0)} uds</p>
                      </div>
                      <div className="flex-1 relative">
                        {totalUdsCatLocal > 0 && (
                          <div
                            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full z-10 pointer-events-none opacity-40"
                            style={{ left: `${calcPct}%`, backgroundColor: currentTab.hex }}
                          />
                        )}
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={0.01}
                          value={pctValue}
                          onChange={e => handleUpdatePct(item.id, parseFloat(e.target.value))}
                          className="w-full h-2 rounded-full appearance-none cursor-pointer relative z-20"
                          style={{ background: `linear-gradient(to right, ${currentTab.hex} 0%, ${currentTab.hex} ${pctValue}%, #e2e8f0 ${pctValue}%, #e2e8f0 100%)` }}
                        />
                      </div>
                      <div className="w-20 text-right flex-shrink-0">
                        <span className="text-sm font-bold tabular-nums" style={{ color: currentTab.hex }}>{pctValue.toFixed(2)}%</span>
                        {totalUdsCatLocal > 0 && Math.abs(pctValue - calcPct) > 0.1 && (
                          <p className="text-xs text-slate-400 tabular-nums">calc: {calcPct.toFixed(2)}%</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Chart + Tokens */}
          {catItems.length > 0 && (
            <div className="grid grid-cols-2 gap-5">
              <VolDistribucionChart
                items={catItems.map(i => ({ ...i, porcentaje: activeTab === 'inbound' ? i.porcentaje_inbound : i.porcentaje_outbound }))}
                totalPct={totalPct}
                accentColor={currentTab.hex}
              />
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100">
                    <i className="ri-code-line text-slate-600 text-sm" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Tokens para fórmulas — {currentTab.label}</p>
                    <p className="text-xs text-slate-400">Usa estos tokens en Costos por Operación</p>
                  </div>
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {catItems.filter(i => i.is_active).map(item => {
                    const token = `VOLDIST_${item.nombre.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;
                    const cfg = COLOR_CONFIG[item.color ?? 'emerald'] ?? COLOR_CONFIG.emerald;
                    const pctValue = activeTab === 'inbound' ? item.porcentaje_inbound : item.porcentaje_outbound;
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-3 py-2 border-b border-slate-50 last:border-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.hex }} />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-700 truncate">{item.nombre}</p>
                            <p className="text-xs font-mono text-slate-400 truncate">{`{${token}}`}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-bold tabular-nums" style={{ color: currentTab.hex }}>{pctValue.toFixed(2)}%</p>
                          <p className="text-xs text-slate-400 tabular-nums">= {(pctValue / 100).toFixed(4)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}

// ─── UnidadesInput ────────────────────────────────────────────────────────────
function UnidadesInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [local, setLocal] = useState(value === 0 ? '' : String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setLocal(value === 0 ? '' : String(value));
    }
  }, [value, focused]);

  const commit = () => {
    setFocused(false);
    const cleaned = local.replace(/[^0-9.]/g, '');
    const num = parseFloat(cleaned) || 0;
    setLocal(num === 0 ? '' : String(num));
    onChange(num);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
      className="w-36 text-sm font-bold border border-slate-200 rounded-lg px-3 py-2 text-right focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 tabular-nums text-amber-700 transition-all"
      placeholder="0"
    />
  );
}
