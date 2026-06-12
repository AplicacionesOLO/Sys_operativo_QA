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

// ─── Donut chart ─────────────────────────────────────────────────────────────
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

  const remaining  = Math.max(0, 100 - total);
  const isOverflow = total > 100.01;
  const isComplete = Math.abs(total - 100) < 0.01;

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
              opacity={0.9}
            />
            {span > 14 && (
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={8} fill="white" fontWeight="bold">
                {seg.pct.toFixed(2)}%
              </text>
            )}
          </g>
        );
      })}
      {remaining > 0.01 && !isOverflow && built.length > 0 && (() => {
        const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
        const startA = (total / 100) * 360;
        const span   = 360 - startA;
        return (
          <path
            d={`${describeArc(cx, cy, r, startA, 360)} L ${cx + innerR * Math.cos(toRad(360))} ${cy + innerR * Math.sin(toRad(360))} A ${innerR} ${innerR} 0 ${span > 180 ? 1 : 0} 0 ${cx + innerR * Math.cos(toRad(startA))} ${cy + innerR * Math.sin(toRad(startA))} Z`}
            fill="#e2e8f0"
            opacity={0.45}
          />
        );
      })()}
      <text x={cx} y={cy - 10} textAnchor="middle" fontSize={22} fontWeight="bold" fill={isOverflow ? '#f43f5e' : '#1e293b'}>
        {total.toFixed(2)}%
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={9} fill={isComplete ? '#10b981' : '#94a3b8'}>
        {isComplete ? '✓ 100% completo' : isOverflow ? 'EXCEDE 100%' : `${remaining.toFixed(2)}% sin asignar`}
      </text>
    </svg>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function VolDistribucionTotal({ items, onItemsChange }: Props) {
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Todos los segmentos activos (IN + OUT juntos)
  const activeItems = useMemo(() => items.filter(i => i.is_active), [items]);

  // Total de unidades combinado (IN + OUT)
  const totalUds = useMemo(() => activeItems.reduce((s, i) => s + (i.unidades ?? 0), 0), [activeItems]);

  // Cada segmento tiene su % del total combinado basado en unidades
  const segmentos = useMemo(() => activeItems.map(item => {
    const pct = totalUds > 0 ? (item.unidades / totalUds) * 100 : 0;
    const cfg = COLOR_CONFIG[item.color ?? 'emerald'] ?? COLOR_CONFIG.emerald;
    const token = `VOLDIST_TOTAL_${item.nombre.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;
    return { ...item, pctTotal: pct, cfg, token };
  }), [activeItems, totalUds]);

  // Separados por categoría para la leyenda
  const inboundSegs  = useMemo(() => segmentos.filter(s => s.categoria === 'Inbound'),  [segmentos]);
  const outboundSegs = useMemo(() => segmentos.filter(s => s.categoria === 'Outbound'), [segmentos]);

  const totalUdsIn  = useMemo(() => inboundSegs.reduce((s, i)  => s + (i.unidades ?? 0), 0), [inboundSegs]);
  const totalUdsOut = useMemo(() => outboundSegs.reduce((s, i) => s + (i.unidades ?? 0), 0), [outboundSegs]);

  const pctInTotal  = totalUds > 0 ? (totalUdsIn  / totalUds) * 100 : 0;
  const pctOutTotal = totalUds > 0 ? (totalUdsOut / totalUds) * 100 : 0;

  const totalPct = useMemo(() => segmentos.reduce((s, i) => s + i.pctTotal, 0), [segmentos]);

  // Donut segments
  const donutSegs: DonutSeg[] = useMemo(() => segmentos.map(s => ({
    label: s.nombre,
    pct: s.pctTotal,
    color: s.cfg.hex,
    categoria: s.categoria,
  })), [segmentos]);

  // ─── Debounced save ──────────────────────────────────────────────────────
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
    }, 600);
    saveTimers.current.set(id, timer);
  }, []);

  const handleUpdateUnidades = useCallback((id: string, value: number) => {
    const updated = items.map(i => i.id === id ? { ...i, unidades: value } : i);
    onItemsChange(updated);
    debouncedSave(id, { unidades: value });
  }, [items, onItemsChange, debouncedSave]);

  const isComplete = Math.abs(totalPct - 100) < 0.01 || totalUds > 0;

  return (
    <div className="space-y-5">

      {/* ── Summary cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {
            label: 'Total Unidades (IN + OUT)',
            value: fmt(totalUds),
            sub: `${segmentos.length} segmentos activos`,
            icon: 'ri-swap-line',
            color: 'text-teal-500',
            bg: 'bg-teal-50',
          },
          {
            label: 'Unidades Inbound',
            value: fmt(totalUdsIn),
            sub: `${pctInTotal.toFixed(2)}% del total`,
            icon: 'ri-arrow-down-circle-line',
            color: 'text-emerald-500',
            bg: 'bg-emerald-50',
          },
          {
            label: 'Unidades Outbound',
            value: fmt(totalUdsOut),
            sub: `${pctOutTotal.toFixed(2)}% del total`,
            icon: 'ri-arrow-up-circle-line',
            color: 'text-sky-500',
            bg: 'bg-sky-50',
          },
          {
            label: 'Segmentos',
            value: `${inboundSegs.length} IN · ${outboundSegs.length} OUT`,
            sub: totalUds > 0 ? '✓ distribución calculada' : 'Ingresá unidades para calcular',
            icon: 'ri-pie-chart-2-line',
            color: 'text-amber-500',
            bg: 'bg-amber-50',
          },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-4">
            <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${card.bg} flex-shrink-0`}>
              <i className={`${card.icon} text-xl ${card.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400 leading-tight">{card.label}</p>
              <p className="text-base font-bold text-slate-800 leading-tight mt-0.5 tabular-nums">{card.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{card.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Banner explicativo ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-teal-200 bg-teal-50/50 px-5 py-3 flex items-center gap-3">
        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-teal-100 flex-shrink-0">
          <i className="ri-information-line text-teal-600 text-sm" />
        </div>
        <p className="text-xs text-teal-800">
          <strong>Distribución Total IN + OUT:</strong> todos los segmentos (Inbound y Outbound) compiten juntos por el 100%.
          El % de cada segmento se calcula como <strong>sus unidades ÷ total de unidades combinadas</strong>.
          Los tokens <span className="font-mono">{'{VOLDIST_TOTAL_...}'}</span> están disponibles en el constructor de fórmulas de Costos.
        </p>
      </div>

      {/* ── Donut + leyenda ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-teal-50">
            <i className="ri-pie-chart-2-line text-teal-600 text-sm" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Distribución Total Combinada</p>
            <p className="text-xs text-slate-400">Todos los segmentos IN + OUT sobre el 100% global</p>
          </div>
        </div>

        {totalUds === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-14 h-14 flex items-center justify-center rounded-xl bg-slate-100">
              <i className="ri-pie-chart-line text-3xl text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-500">Sin unidades ingresadas</p>
            <p className="text-xs text-slate-400 text-center max-w-xs">
              Ingresá unidades en la pestaña <strong>Segmentos</strong> para ver la distribución total combinada
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-8">
            {/* Donut */}
            <div className="flex-shrink-0">
              <CombinedDonut segments={donutSegs} total={totalPct} />
              {/* IN vs OUT bar */}
              <div className="mt-3 w-[220px]">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span className="font-semibold text-emerald-600">IN {pctInTotal.toFixed(2)}%</span>
                  <span className="font-semibold text-sky-600">OUT {pctOutTotal.toFixed(2)}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden bg-slate-100 flex">
                  <div className="h-full bg-emerald-400 transition-all duration-500" style={{ width: `${pctInTotal}%` }} />
                  <div className="h-full bg-sky-400 transition-all duration-500" style={{ width: `${pctOutTotal}%` }} />
                </div>
              </div>
            </div>

            {/* Leyenda */}
            <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-6 gap-y-1 content-start">
              {/* Inbound group */}
              <div>
                <div className="flex items-center gap-1.5 mb-2 pb-1 border-b border-emerald-100">
                  <i className="ri-arrow-down-circle-line text-emerald-500 text-xs" />
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Inbound</span>
                  <span className="text-xs text-emerald-500 ml-auto">{pctInTotal.toFixed(2)}%</span>
                </div>
                <div className="space-y-2">
                  {inboundSegs.map(seg => (
                    <div key={seg.id} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.cfg.hex }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium text-slate-700 truncate">{seg.nombre}</span>
                          <span className="text-xs font-bold tabular-nums flex-shrink-0" style={{ color: seg.cfg.hex }}>
                            {seg.pctTotal.toFixed(2)}%
                          </span>
                        </div>
                        <div className="h-1 bg-slate-100 rounded-full mt-0.5 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(seg.pctTotal, 100)}%`, backgroundColor: seg.cfg.hex }} />
                        </div>
                        <p className="text-xs text-slate-400 tabular-nums mt-0.5">{fmt(seg.unidades ?? 0)} uds</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Outbound group */}
              <div>
                <div className="flex items-center gap-1.5 mb-2 pb-1 border-b border-sky-100">
                  <i className="ri-arrow-up-circle-line text-sky-500 text-xs" />
                  <span className="text-xs font-bold text-sky-700 uppercase tracking-wide">Outbound</span>
                  <span className="text-xs text-sky-500 ml-auto">{pctOutTotal.toFixed(2)}%</span>
                </div>
                <div className="space-y-2">
                  {outboundSegs.map(seg => (
                    <div key={seg.id} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.cfg.hex }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium text-slate-700 truncate">{seg.nombre}</span>
                          <span className="text-xs font-bold tabular-nums flex-shrink-0" style={{ color: seg.cfg.hex }}>
                            {seg.pctTotal.toFixed(2)}%
                          </span>
                        </div>
                        <div className="h-1 bg-slate-100 rounded-full mt-0.5 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(seg.pctTotal, 100)}%`, backgroundColor: seg.cfg.hex }} />
                        </div>
                        <p className="text-xs text-slate-400 tabular-nums mt-0.5">{fmt(seg.unidades ?? 0)} uds</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Tabla de segmentos con edición de unidades ──────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100">
            <i className="ri-table-line text-slate-600 text-sm" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Segmentos — Distribución Total</p>
            <p className="text-xs text-slate-400">Podés ajustar las unidades directamente aquí · el % se recalcula automáticamente</p>
          </div>
        </div>

        {/* Header */}
        <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-0 bg-slate-50 border-b border-slate-100">
          {['Cat.', 'Segmento', 'Unidades', '% del Total', 'Token fórmula'].map((h, i) => (
            <div key={i} className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide ${i >= 2 ? 'text-right' : ''}`}>
              {h}
            </div>
          ))}
        </div>

        {/* Inbound rows */}
        {inboundSegs.length > 0 && (
          <>
            <div className="px-4 py-2 bg-emerald-50/50 border-b border-emerald-100">
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
                <i className="ri-arrow-down-circle-line" /> Inbound — {pctInTotal.toFixed(2)}% del total
              </span>
            </div>
            {inboundSegs.map((seg, idx) => (
              <div key={seg.id} className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-0 border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                <div className="px-4 py-3 flex items-center">
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700 whitespace-nowrap">IN</span>
                </div>
                <div className="px-4 py-3 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.cfg.hex }} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{seg.nombre}</p>
                    <p className="text-xs text-slate-400">#{idx + 1}</p>
                  </div>
                  {saving.has(seg.id) && <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                </div>
                <div className="px-4 py-3 flex items-center justify-end">
                  <TotalUnidadesInput
                    value={seg.unidades ?? 0}
                    onChange={val => handleUpdateUnidades(seg.id, val)}
                  />
                </div>
                <div className="px-4 py-3 flex flex-col items-end justify-center gap-1">
                  <span className="text-sm font-bold tabular-nums" style={{ color: seg.cfg.hex }}>
                    {seg.pctTotal.toFixed(2)}%
                  </span>
                  <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(seg.pctTotal, 100)}%`, backgroundColor: seg.cfg.hex }} />
                  </div>
                </div>
                <div className="px-4 py-3 flex items-center justify-end">
                  <span className="text-xs font-mono bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md border border-emerald-100 truncate max-w-full">
                    {`{${seg.token}}`}
                  </span>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Outbound rows */}
        {outboundSegs.length > 0 && (
          <>
            <div className="px-4 py-2 bg-sky-50/50 border-b border-sky-100">
              <span className="text-xs font-bold text-sky-700 uppercase tracking-wide flex items-center gap-1.5">
                <i className="ri-arrow-up-circle-line" /> Outbound — {pctOutTotal.toFixed(2)}% del total
              </span>
            </div>
            {outboundSegs.map((seg, idx) => (
              <div key={seg.id} className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-0 border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                <div className="px-4 py-3 flex items-center">
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-sky-100 text-sky-700 whitespace-nowrap">OUT</span>
                </div>
                <div className="px-4 py-3 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.cfg.hex }} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{seg.nombre}</p>
                    <p className="text-xs text-slate-400">#{idx + 1}</p>
                  </div>
                  {saving.has(seg.id) && <div className="w-3 h-3 border border-sky-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                </div>
                <div className="px-4 py-3 flex items-center justify-end">
                  <TotalUnidadesInput
                    value={seg.unidades ?? 0}
                    onChange={val => handleUpdateUnidades(seg.id, val)}
                  />
                </div>
                <div className="px-4 py-3 flex flex-col items-end justify-center gap-1">
                  <span className="text-sm font-bold tabular-nums" style={{ color: seg.cfg.hex }}>
                    {seg.pctTotal.toFixed(2)}%
                  </span>
                  <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(seg.pctTotal, 100)}%`, backgroundColor: seg.cfg.hex }} />
                  </div>
                </div>
                <div className="px-4 py-3 flex items-center justify-end">
                  <span className="text-xs font-mono bg-sky-50 text-sky-700 px-2 py-1 rounded-md border border-sky-100 truncate max-w-full">
                    {`{${seg.token}}`}
                  </span>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Total row */}
        <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-0 bg-slate-50 border-t-2 border-slate-200">
          <div className="px-4 py-3" />
          <div className="px-4 py-3">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Total General</span>
          </div>
          <div className="px-4 py-3 text-right">
            <span className="text-sm font-bold text-amber-600 tabular-nums">{fmt(totalUds)}</span>
            <p className="text-xs text-slate-400">unidades</p>
          </div>
          <div className="px-4 py-3 text-right">
            <span className="text-sm font-bold text-teal-600 tabular-nums">
              {totalUds > 0 ? '100.00%' : '0.00%'}
            </span>
            <p className="text-xs text-slate-400">{totalUds > 0 ? '✓ completo' : 'sin datos'}</p>
          </div>
          <div className="px-4 py-3" />
        </div>
      </div>

      {/* ── Tokens reference ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100">
            <i className="ri-code-s-slash-line text-slate-600 text-sm" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Tokens para Costos por Operación</p>
            <p className="text-xs text-slate-400">Tokens <span className="font-mono">{'{VOLDIST_TOTAL_...}'}</span> — fracción decimal del % combinado IN+OUT</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Inbound */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Inbound</span>
            </div>
            <div className="space-y-1.5">
              {inboundSegs.map(seg => (
                <div key={seg.id} className="flex items-center justify-between gap-3 py-1.5 px-3 rounded-lg bg-emerald-50/60 border border-emerald-100">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono text-emerald-700 truncate">{`{${seg.token}}`}</p>
                    <p className="text-xs text-slate-500 truncate">{seg.nombre}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold tabular-nums" style={{ color: seg.cfg.hex }}>{seg.pctTotal.toFixed(2)}%</p>
                    <p className="text-xs text-slate-400 tabular-nums">= {(seg.pctTotal / 100).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Outbound */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2 h-2 rounded-full bg-sky-400" />
              <span className="text-xs font-bold text-sky-700 uppercase tracking-wide">Outbound</span>
            </div>
            <div className="space-y-1.5">
              {outboundSegs.map(seg => (
                <div key={seg.id} className="flex items-center justify-between gap-3 py-1.5 px-3 rounded-lg bg-sky-50/60 border border-sky-100">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono text-sky-700 truncate">{`{${seg.token}}`}</p>
                    <p className="text-xs text-slate-500 truncate">{seg.nombre}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold tabular-nums" style={{ color: seg.cfg.hex }}>{seg.pctTotal.toFixed(2)}%</p>
                    <p className="text-xs text-slate-400 tabular-nums">= {(seg.pctTotal / 100).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-100 flex items-start gap-2">
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
            <i className="ri-lightbulb-line text-amber-500 text-sm" />
          </div>
          <p className="text-xs text-amber-700">
            Estos tokens representan la <strong>participación de cada segmento sobre el total combinado IN+OUT</strong>.
            Por ejemplo, si Despacho Nacionalizado tiene 5.000 uds de 20.000 totales → token = 0.25 (25%).
            Usá <span className="font-mono">{'{VOLDIST_TOTAL_...}'}</span> en el constructor de fórmulas de <strong>Costos por Operación</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Input de unidades inline ─────────────────────────────────────────────────
function TotalUnidadesInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [local, setLocal] = useState(value === 0 ? '' : String(value));
  const [focused, setFocused] = useState(false);

  const commit = () => {
    setFocused(false);
    const num = parseFloat(local.replace(/[^0-9.]/g, '')) || 0;
    setLocal(num === 0 ? '' : String(num));
    onChange(num);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={focused ? local : (value === 0 ? '' : fmt(value))}
      onChange={e => setLocal(e.target.value)}
      onFocus={() => { setFocused(true); setLocal(value === 0 ? '' : String(value)); }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className="w-32 text-sm font-bold border border-slate-200 rounded-lg px-3 py-1.5 text-right focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 tabular-nums text-amber-700 transition-all"
      placeholder="0"
    />
  );
}
