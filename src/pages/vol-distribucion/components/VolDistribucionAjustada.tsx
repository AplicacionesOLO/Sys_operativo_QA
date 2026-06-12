import { useMemo, useState, useCallback, useRef } from 'react';
import type { VolDistribucion } from '@/types/vol_distribucion';
import { COLOR_CONFIG } from '@/types/vol_distribucion';
import { supabase } from '@/lib/supabase';

interface Props {
  items: VolDistribucion[];
  onItemsChange: (items: VolDistribucion[]) => void;
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
}

// ─── Donut chart helper ──────────────────────────────────────────────────────
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const start = { x: cx + r * Math.cos(toRad(startAngle)), y: cy + r * Math.sin(toRad(startAngle)) };
  const end   = { x: cx + r * Math.cos(toRad(endAngle)),   y: cy + r * Math.sin(toRad(endAngle))   };
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

interface DonutSeg { label: string; pct: number; color: string; categoria: string }

function CombinedDonut({ segments, total }: { segments: DonutSeg[]; total: number }) {
  const cx = 110; const cy = 110; const r = 88; const innerR = 58;

  const built = useMemo(() => {
    let cum = 0;
    return segments.filter(s => s.pct > 0).map(s => {
      const startAngle = (cum / 100) * 360;
      const endAngle   = ((cum + s.pct) / 100) * 360;
      cum += s.pct;
      return { ...s, startAngle, endAngle };
    });
  }, [segments]);

  return (
    <svg width={220} height={220} viewBox="0 0 220 220">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={r - innerR} />
      {built.length === 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={r - innerR} />
      )}
      {built.map((seg, i) => {
        const span = seg.endAngle - seg.startAngle;
        if (span <= 0) return null;
        const midR     = (r + innerR) / 2;
        const midAngle = ((seg.startAngle + seg.endAngle) / 2 - 90) * (Math.PI / 180);
        const lx = cx + midR * Math.cos(midAngle);
        const ly = cy + midR * Math.sin(midAngle);
        const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
        return (
          <g key={i}>
            <path
              d={`${describeArc(cx, cy, r, seg.startAngle, seg.endAngle)} L ${cx + innerR * Math.cos(toRad(seg.endAngle))} ${cy + innerR * Math.sin(toRad(seg.endAngle))} A ${innerR} ${innerR} 0 ${span > 180 ? 1 : 0} 0 ${cx + innerR * Math.cos(toRad(seg.startAngle))} ${cy + innerR * Math.sin(toRad(seg.startAngle))} Z`}
              fill={seg.color}
              opacity={0.85}
            />
            {span > 14 && (
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={8} fill="white" fontWeight="bold">
                {seg.pct.toFixed(2)}%
              </text>
            )}
          </g>
        );
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={20} fontWeight="bold" fill="#1e293b">
        100%
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={9} fill="#65a30d">
        ✓ Distribución Ajustada
      </text>
    </svg>
  );
}

export default function VolDistribucionAjustada({ items, onItemsChange }: Props) {
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [showTokens, setShowTokens] = useState(false);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const activeItems = useMemo(() => items.filter(i => i.is_active), [items]);

  // Zona franca items
  const zonaFrancaItems = useMemo(() => activeItems.filter(i => i.es_zona_franca), [activeItems]);
  const ajustadosItems = useMemo(() => activeItems.filter(i => !i.es_zona_franca), [activeItems]);

  const inboundAjustados  = useMemo(() => ajustadosItems.filter(i => i.categoria === 'Inbound'),  [ajustadosItems]);
  const outboundAjustados = useMemo(() => ajustadosItems.filter(i => i.categoria === 'Outbound'), [ajustadosItems]);

  // Totals for adjusted
  const udsInAjustadas  = useMemo(() => inboundAjustados.reduce((s, i)  => s + (i.unidades ?? 0), 0), [inboundAjustados]);
  const udsOutAjustadas = useMemo(() => outboundAjustados.reduce((s, i) => s + (i.unidades ?? 0), 0), [outboundAjustados]);
  const udsTotalAjustadas = udsInAjustadas + udsOutAjustadas;

  // Totals originales (todo)
  const udsInTotales  = useMemo(() => activeItems.filter(i => i.categoria === 'Inbound').reduce((s, i) => s + (i.unidades ?? 0), 0), [activeItems]);
  const udsOutTotales = useMemo(() => activeItems.filter(i => i.categoria === 'Outbound').reduce((s, i) => s + (i.unidades ?? 0), 0), [activeItems]);
  const udsTotales = udsInTotales + udsOutTotales;

  // Adjusted percentages per segment
  const segmentosAjustados = useMemo(() => ajustadosItems.map(item => {
    const cfg = COLOR_CONFIG[item.color ?? 'emerald'] ?? COLOR_CONFIG.emerald;
    const totalCat = item.categoria === 'Inbound' ? udsInAjustadas : udsOutAjustadas;
    const pctCat = totalCat > 0 ? ((item.unidades ?? 0) / totalCat) * 100 : 0;
    const pctTotal = udsTotalAjustadas > 0 ? ((item.unidades ?? 0) / udsTotalAjustadas) * 100 : 0;
    const token = `VOLDIST_AJUSTADA_${item.nombre.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;
    return { ...item, cfg, pctCat, pctTotal, token };
  }), [ajustadosItems, udsInAjustadas, udsOutAjustadas, udsTotalAjustadas]);

  // Donut segments
  const donutSegs: DonutSeg[] = useMemo(() => segmentosAjustados.map(s => ({
    label: s.nombre,
    pct: s.pctTotal,
    color: s.cfg.hex,
    categoria: s.categoria,
  })), [segmentosAjustados]);

  // IN/OUT shares on adjusted total
  const pctInAdj  = udsTotalAjustadas > 0 ? (udsInAjustadas  / udsTotalAjustadas) * 100 : 0;
  const pctOutAdj = udsTotalAjustadas > 0 ? (udsOutAjustadas / udsTotalAjustadas) * 100 : 0;

  const debouncedToggleZF = useCallback((id: string, newVal: boolean) => {
    const updated = items.map(i => i.id === id ? { ...i, es_zona_franca: newVal } : i);
    onItemsChange(updated);
    setSaving(prev => new Set(prev).add(id));
    supabase
      .from('volumen_distribucion')
      .update({ es_zona_franca: newVal, updated_at: new Date().toISOString() })
      .eq('id', id)
      .then(() => setSaving(prev => { const s = new Set(prev); s.delete(id); return s; }));
  }, [items, onItemsChange]);

  const canAdjust = zonaFrancaItems.length > 0 && ajustadosItems.length > 0;

  return (
    <div className="space-y-5">

      {/* ── Banner explicativo ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-lime-200 bg-lime-50/60 px-5 py-4 flex items-start gap-3">
        <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-lime-100 flex-shrink-0 mt-0.5">
          <i className="ri-filter-off-line text-lime-600 text-lg" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-lime-800">Distribución Ajustada — Sin Zona Franca</p>
          <p className="text-xs text-lime-700 mt-1">
            Esta distribución recalcula los porcentajes <strong>excluyendo los segmentos marcados como Zona Franca</strong>.
            Los tokens <span className="font-mono font-semibold">{'{VOLDIST_AJUSTADA_...}'}</span> están disponibles en Costos por Operación
            para que uses esta distribución alternativa en tus fórmulas.
          </p>
        </div>
      </div>

      {/* ── Summary cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {
            label: 'Total Ajustado (sin ZF)',
            value: fmt(udsTotalAjustadas),
            sub: `${ajustadosItems.length} segmentos · ${fmt(udsTotales - udsTotalAjustadas)} uds excluidas`,
            icon: 'ri-filter-off-line',
            color: 'text-lime-500',
            bg: 'bg-lime-50',
          },
          {
            label: 'Inbound Ajustado',
            value: fmt(udsInAjustadas),
            sub: `${pctInAdj.toFixed(2)}% del total ajustado`,
            icon: 'ri-arrow-down-circle-line',
            color: 'text-emerald-500',
            bg: 'bg-emerald-50',
          },
          {
            label: 'Outbound Ajustado',
            value: fmt(udsOutAjustadas),
            sub: `${pctOutAdj.toFixed(2)}% del total ajustado`,
            icon: 'ri-arrow-up-circle-line',
            color: 'text-sky-500',
            bg: 'bg-sky-50',
          },
          {
            label: 'Zona Franca Excluida',
            value: `${zonaFrancaItems.length} segmentos`,
            sub: `${fmt(zonaFrancaItems.reduce((s, i) => s + (i.unidades ?? 0), 0))} uds excluidas`,
            icon: 'ri-forbid-line',
            color: 'text-rose-500',
            bg: 'bg-rose-50',
          },
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

      {/* ── Aviso si no hay zona franca ──────────────────────────────────────── */}
      {!canAdjust && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-5 flex items-start gap-3">
          <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-amber-100 flex-shrink-0">
            <i className="ri-information-line text-amber-600 text-sm" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-800">Sin segmentos para ajustar</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Para que la distribución ajustada tenga sentido, necesitás al menos un segmento marcado como Zona Franca y al menos uno sin marcar.
              Usá los toggles de abajo para marcar/desmarcar segmentos.
            </p>
          </div>
        </div>
      )}

      {/* ── Donut + comparativa ────────────────────────────────────────────── */}
      {canAdjust && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-lime-50">
              <i className="ri-pie-chart-2-line text-lime-600 text-sm" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Distribución Ajustada Combinada</p>
              <p className="text-xs text-slate-400">Segmentos IN + OUT sin Zona Franca sobre el 100% ajustado</p>
            </div>
          </div>

          <div className="flex items-start gap-8">
            {/* Donut */}
            <div className="flex-shrink-0">
              <CombinedDonut segments={donutSegs} total={100} />
              <div className="mt-3 w-[220px]">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span className="font-semibold text-emerald-600">IN {pctInAdj.toFixed(2)}%</span>
                  <span className="font-semibold text-sky-600">OUT {pctOutAdj.toFixed(2)}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden bg-slate-100 flex">
                  <div className="h-full bg-emerald-400 transition-all duration-500" style={{ width: `${pctInAdj}%` }} />
                  <div className="h-full bg-sky-400 transition-all duration-500" style={{ width: `${pctOutAdj}%` }} />
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-6 gap-y-1 content-start">
              <div>
                <div className="flex items-center gap-1.5 mb-2 pb-1 border-b border-emerald-100">
                  <i className="ri-arrow-down-circle-line text-emerald-500 text-xs" />
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Inbound Ajustado</span>
                  <span className="text-xs text-emerald-500 ml-auto">{pctInAdj.toFixed(2)}%</span>
                </div>
                <div className="space-y-2">
                  {segmentosAjustados.filter(s => s.categoria === 'Inbound').map(seg => (
                    <div key={seg.id} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.cfg.hex }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium text-slate-700 truncate">{seg.nombre}</span>
                          <span className="text-xs font-bold tabular-nums flex-shrink-0" style={{ color: seg.cfg.hex }}>
                            {seg.pctCat.toFixed(2)}%
                          </span>
                        </div>
                        <div className="h-1 bg-slate-100 rounded-full mt-0.5 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(seg.pctCat, 100)}%`, backgroundColor: seg.cfg.hex }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-2 pb-1 border-b border-sky-100">
                  <i className="ri-arrow-up-circle-line text-sky-500 text-xs" />
                  <span className="text-xs font-bold text-sky-700 uppercase tracking-wide">Outbound Ajustado</span>
                  <span className="text-xs text-sky-500 ml-auto">{pctOutAdj.toFixed(2)}%</span>
                </div>
                <div className="space-y-2">
                  {segmentosAjustados.filter(s => s.categoria === 'Outbound').map(seg => (
                    <div key={seg.id} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.cfg.hex }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium text-slate-700 truncate">{seg.nombre}</span>
                          <span className="text-xs font-bold tabular-nums flex-shrink-0" style={{ color: seg.cfg.hex }}>
                            {seg.pctCat.toFixed(2)}%
                          </span>
                        </div>
                        <div className="h-1 bg-slate-100 rounded-full mt-0.5 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(seg.pctCat, 100)}%`, backgroundColor: seg.cfg.hex }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tabla de segmentos con toggle ZF ─────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100">
              <i className="ri-table-line text-slate-600 text-sm" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Segmentos y Zona Franca</p>
              <p className="text-xs text-slate-400">Activá/desactivá el toggle de ZF para cada segmento</p>
            </div>
          </div>
          <button
            onClick={() => setShowTokens(!showTokens)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
              showTokens ? 'bg-lime-100 text-lime-700 border border-lime-200' : 'border border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            <div className="w-4 h-4 flex items-center justify-center">
              <i className={`text-xs ${showTokens ? 'ri-code-s-slash-line' : 'ri-code-line'}`} />
            </div>
            {showTokens ? 'Ocultar Tokens' : 'Ver Tokens'}
          </button>
        </div>

        {/* Headers */}
        <div className={`grid ${showTokens ? 'grid-cols-[auto_1fr_1fr_1fr_auto_1fr]' : 'grid-cols-[auto_1fr_1fr_auto]'} gap-0 bg-slate-50 border-b border-slate-100`}>
          {(['Cat.', 'Segmento', 'Unidades', showTokens ? '% Ajustado' : '', 'Zona Franca', showTokens ? 'Token Ajustado' : ''].filter(Boolean) as string[]).map((h, i) => (
            <div key={i} className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide ${h === 'Unidades' || h === '% Ajustado' ? 'text-right' : ''} ${h === 'Zona Franca' ? 'text-center' : ''}`}>
              {h}
            </div>
          ))}
        </div>

        {/* Inbound rows */}
        {activeItems.filter(i => i.categoria === 'Inbound').length > 0 && (
          <>
            <div className="px-4 py-2 bg-emerald-50/50 border-b border-emerald-100">
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
                <i className="ri-arrow-down-circle-line" /> Inbound
              </span>
            </div>
            {activeItems.filter(i => i.categoria === 'Inbound').map((item, idx) => {
              const cfg = COLOR_CONFIG[item.color ?? 'emerald'] ?? COLOR_CONFIG.emerald;
              const seg = segmentosAjustados.find(s => s.id === item.id);
              const isZF = item.es_zona_franca ?? false;
              const isSaving = saving.has(item.id);
              return (
                <div key={item.id} className={`grid ${showTokens ? 'grid-cols-[auto_1fr_1fr_1fr_auto_1fr]' : 'grid-cols-[auto_1fr_1fr_auto]'} gap-0 border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${isZF ? 'opacity-55 bg-rose-50/30' : ''}`}>
                  <div className="px-4 py-3 flex items-center">
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700 whitespace-nowrap">IN</span>
                  </div>
                  <div className="px-4 py-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.hex }} />
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${isZF ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{item.nombre}</p>
                      <p className="text-xs text-slate-400">#{idx + 1}</p>
                    </div>
                    {isSaving && <div className="w-3 h-3 border border-lime-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                  </div>
                  <div className="px-4 py-3 flex items-center justify-end">
                    <span className={`text-sm font-bold tabular-nums ${isZF ? 'text-slate-300' : 'text-amber-700'}`}>
                      {fmt(item.unidades ?? 0)}
                    </span>
                  </div>
                  {showTokens && (
                    <div className="px-4 py-3 flex items-center justify-end">
                      {seg ? (
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-bold tabular-nums" style={{ color: cfg.hex }}>{seg.pctCat.toFixed(2)}%</span>
                          <span className="text-xs text-slate-400 tabular-nums">= {(seg.pctCat / 100).toFixed(2)}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-rose-400 italic">Excluido</span>
                      )}
                    </div>
                  )}
                  <div className="px-4 py-3 flex items-center justify-center">
                    <button
                      onClick={() => debouncedToggleZF(item.id, !isZF)}
                      className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${isZF ? 'bg-rose-400' : 'bg-slate-200 hover:bg-slate-300'}`}
                      title={isZF ? 'Quitar de Zona Franca' : 'Marcar como Zona Franca'}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${isZF ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </div>
                  {showTokens && (
                    <div className="px-4 py-3 flex items-center">
                      {seg ? (
                        <span className="text-xs font-mono bg-lime-50 text-lime-700 px-2 py-1 rounded-md border border-lime-200 truncate max-w-full">
                          {`{${seg.token}}`}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300 italic">—</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* Outbound rows */}
        {activeItems.filter(i => i.categoria === 'Outbound').length > 0 && (
          <>
            <div className="px-4 py-2 bg-sky-50/50 border-b border-sky-100">
              <span className="text-xs font-bold text-sky-700 uppercase tracking-wide flex items-center gap-1.5">
                <i className="ri-arrow-up-circle-line" /> Outbound
              </span>
            </div>
            {activeItems.filter(i => i.categoria === 'Outbound').map((item, idx) => {
              const cfg = COLOR_CONFIG[item.color ?? 'emerald'] ?? COLOR_CONFIG.emerald;
              const seg = segmentosAjustados.find(s => s.id === item.id);
              const isZF = item.es_zona_franca ?? false;
              const isSaving = saving.has(item.id);
              return (
                <div key={item.id} className={`grid ${showTokens ? 'grid-cols-[auto_1fr_1fr_1fr_auto_1fr]' : 'grid-cols-[auto_1fr_1fr_auto]'} gap-0 border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${isZF ? 'opacity-55 bg-rose-50/30' : ''}`}>
                  <div className="px-4 py-3 flex items-center">
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-sky-100 text-sky-700 whitespace-nowrap">OUT</span>
                  </div>
                  <div className="px-4 py-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.hex }} />
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${isZF ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{item.nombre}</p>
                      <p className="text-xs text-slate-400">#{idx + 1}</p>
                    </div>
                    {isSaving && <div className="w-3 h-3 border border-lime-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                  </div>
                  <div className="px-4 py-3 flex items-center justify-end">
                    <span className={`text-sm font-bold tabular-nums ${isZF ? 'text-slate-300' : 'text-amber-700'}`}>
                      {fmt(item.unidades ?? 0)}
                    </span>
                  </div>
                  {showTokens && (
                    <div className="px-4 py-3 flex items-center justify-end">
                      {seg ? (
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-bold tabular-nums" style={{ color: cfg.hex }}>{seg.pctCat.toFixed(2)}%</span>
                          <span className="text-xs text-slate-400 tabular-nums">= {(seg.pctCat / 100).toFixed(2)}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-rose-400 italic">Excluido</span>
                      )}
                    </div>
                  )}
                  <div className="px-4 py-3 flex items-center justify-center">
                    <button
                      onClick={() => debouncedToggleZF(item.id, !isZF)}
                      className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${isZF ? 'bg-rose-400' : 'bg-slate-200 hover:bg-slate-300'}`}
                      title={isZF ? 'Quitar de Zona Franca' : 'Marcar como Zona Franca'}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${isZF ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </div>
                  {showTokens && (
                    <div className="px-4 py-3 flex items-center">
                      {seg ? (
                        <span className="text-xs font-mono bg-lime-50 text-lime-700 px-2 py-1 rounded-md border border-lime-200 truncate max-w-full">
                          {`{${seg.token}}`}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300 italic">—</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* Total row */}
        <div className={`grid ${showTokens ? 'grid-cols-[auto_1fr_1fr_1fr_auto_1fr]' : 'grid-cols-[auto_1fr_1fr_auto]'} gap-0 bg-slate-50 border-t-2 border-slate-200`}>
          <div className="px-4 py-3" />
          <div className="px-4 py-3">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Total</span>
          </div>
          <div className="px-4 py-3 text-right">
            <span className="text-sm font-bold text-amber-600 tabular-nums">{fmt(udsTotales)}</span>
            <p className="text-xs text-slate-400">unidades totales</p>
          </div>
          {showTokens && (
            <div className="px-4 py-3 text-right">
              <span className="text-sm font-bold text-lime-600 tabular-nums">
                {canAdjust ? '100.00%' : '—'}
              </span>
              <p className="text-xs text-slate-400">{canAdjust ? 'ajustado' : ''}</p>
            </div>
          )}
          <div className="px-4 py-3 flex items-center justify-center">
            <span className="text-xs text-slate-400">{zonaFrancaItems.length} excluidos</span>
          </div>
          {showTokens && <div className="px-4 py-3" />}
        </div>
      </div>

      {/* ── Tokens de fórmulas ─────────────────────────────────────────────── */}
      {canAdjust && (
        <div className="bg-white rounded-xl border border-lime-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-lime-100">
              <i className="ri-code-s-slash-line text-lime-600 text-sm" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Tokens para Costos por Operación — Ajustados</p>
              <p className="text-xs text-slate-400">Usá <span className="font-mono">{'{VOLDIST_AJUSTADA_...}'}</span> en el constructor de fórmulas</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Inbound */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Inbound Ajustado</span>
              </div>
              <div className="space-y-1.5">
                {segmentosAjustados.filter(s => s.categoria === 'Inbound').map(seg => (
                  <div key={seg.id} className="flex items-center justify-between gap-3 py-1.5 px-3 rounded-lg bg-lime-50/80 border border-lime-100">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono text-lime-700 truncate">{`{${seg.token}}`}</p>
                      <p className="text-xs text-slate-500 truncate">{seg.nombre}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold tabular-nums" style={{ color: seg.cfg.hex }}>{seg.pctCat.toFixed(2)}%</p>
                      <p className="text-xs text-slate-400 tabular-nums">= {(seg.pctCat / 100).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Outbound */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <div className="w-2 h-2 rounded-full bg-sky-400" />
                <span className="text-xs font-bold text-sky-700 uppercase tracking-wide">Outbound Ajustado</span>
              </div>
              <div className="space-y-1.5">
                {segmentosAjustados.filter(s => s.categoria === 'Outbound').map(seg => (
                  <div key={seg.id} className="flex items-center justify-between gap-3 py-1.5 px-3 rounded-lg bg-lime-50/80 border border-lime-100">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono text-lime-700 truncate">{`{${seg.token}}`}</p>
                      <p className="text-xs text-slate-500 truncate">{seg.nombre}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold tabular-nums" style={{ color: seg.cfg.hex }}>{seg.pctCat.toFixed(2)}%</p>
                      <p className="text-xs text-slate-400 tabular-nums">= {(seg.pctCat / 100).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Totales combinados */}
          <div className="mt-4 pt-4 border-t border-lime-100 space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="py-1.5 px-3 rounded-lg bg-lime-50/60 border border-lime-100 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-mono text-lime-700">{'{VOLDIST_AJUSTADA_TOTAL_INBOUND}'}</p>
                  <p className="text-xs text-slate-500">Total IN sobre combinado ajustado</p>
                </div>
                <span className="text-xs font-bold text-emerald-600 tabular-nums flex-shrink-0">{pctInAdj.toFixed(2)}%</span>
              </div>
              <div className="py-1.5 px-3 rounded-lg bg-lime-50/60 border border-lime-100 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-mono text-lime-700">{'{VOLDIST_AJUSTADA_TOTAL_OUTBOUND}'}</p>
                  <p className="text-xs text-slate-500">Total OUT sobre combinado ajustado</p>
                </div>
                <span className="text-xs font-bold text-sky-600 tabular-nums flex-shrink-0">{pctOutAdj.toFixed(2)}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Comparativa: Original vs Ajustado ──────────────────────────────── */}
      {canAdjust && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100">
              <i className="ri-scales-3-line text-slate-600 text-sm" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Comparativa: Original vs Ajustado</p>
              <p className="text-xs text-slate-400">Cómo cambia la distribución al excluir Zona Franca</p>
            </div>
          </div>

          <div className="space-y-3">
            {segmentosAjustados.map(seg => {
              const originalItem = activeItems.find(i => i.id === seg.id);
              const catTotal = seg.categoria === 'Inbound' ? udsInTotales : udsOutTotales;
              const pctOriginal = catTotal > 0 ? ((seg.unidades ?? 0) / catTotal) * 100 : 0;
              const diff = seg.pctCat - pctOriginal;

              return (
                <div key={seg.id} className="flex items-center gap-4">
                  <div className="w-32 flex-shrink-0 flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.cfg.hex }} />
                    <span className="text-xs font-medium text-slate-700 truncate">{seg.nombre}</span>
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 h-6 bg-slate-100 rounded-lg relative overflow-hidden">
                      {/* Original bar */}
                      <div
                        className="absolute inset-y-0 left-0 rounded-lg opacity-30"
                        style={{ width: `${Math.min(pctOriginal, 100)}%`, backgroundColor: '#94a3b8' }}
                      />
                      {/* Adjusted bar */}
                      <div
                        className="absolute inset-y-0 left-0 rounded-lg"
                        style={{ width: `${Math.min(seg.pctCat, 100)}%`, backgroundColor: seg.cfg.hex }}
                      />
                    </div>
                    <div className="w-28 text-right flex-shrink-0 flex items-center justify-end gap-2">
                      <span className="text-xs text-slate-400 tabular-nums line-through">{pctOriginal.toFixed(2)}%</span>
                      <span className="text-xs font-bold tabular-nums" style={{ color: seg.cfg.hex }}>{seg.pctCat.toFixed(2)}%</span>
                      <span className={`text-xs font-semibold tabular-nums ${diff > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(2)}pp
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}