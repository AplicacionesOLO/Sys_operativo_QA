import { useMemo } from 'react';
import type { VolDistribucion } from '@/types/vol_distribucion';
import { COLOR_CONFIG } from '@/types/vol_distribucion';

interface Props {
  items: VolDistribucion[];
  totalPct: number;
  accentColor?: string;
}

export default function VolDistribucionChart({ items, totalPct, accentColor }: Props) {
  const activeItems = useMemo(() => items.filter(i => i.is_active && i.porcentaje > 0), [items]);
  const remaining = Math.max(0, 100 - totalPct);
  const isOverflow = totalPct > 100.01;

  // Build segments for the donut chart
  const segments = useMemo(() => {
    const segs: { item: VolDistribucion; startAngle: number; endAngle: number; color: string }[] = [];
    let cumulative = 0;
    activeItems.forEach(item => {
      const pct = Math.min(item.porcentaje, 100);
      const startAngle = (cumulative / 100) * 360;
      const endAngle = ((cumulative + pct) / 100) * 360;
      const cfg = COLOR_CONFIG[item.color ?? 'emerald'] ?? COLOR_CONFIG.emerald;
      segs.push({ item, startAngle, endAngle, color: cfg.hex });
      cumulative += pct;
    });
    return segs;
  }, [activeItems]);

  // SVG donut path helper
  function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
    const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
    const start = { x: cx + r * Math.cos(toRad(startAngle)), y: cy + r * Math.sin(toRad(startAngle)) };
    const end = { x: cx + r * Math.cos(toRad(endAngle)), y: cy + r * Math.sin(toRad(endAngle)) };
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  }

  const cx = 100;
  const cy = 100;
  const r = 75;
  const innerR = 50;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ backgroundColor: accentColor ? `${accentColor}15` : '#ecfdf5' }}>
          <i className="ri-pie-chart-2-line text-sm" style={{ color: accentColor ?? '#10b981' }} />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">Distribución visual</p>
          <p className="text-xs text-slate-400">Representación proporcional de los segmentos</p>
        </div>
      </div>

      <div className="flex items-center gap-8">
        {/* Donut chart */}
        <div className="relative flex-shrink-0">
          <svg width={200} height={200} viewBox="0 0 200 200">
            {/* Background circle */}
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={r - innerR} />

            {/* Segments */}
            {segments.length === 0 ? (
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={r - innerR} />
            ) : (
              segments.map((seg, i) => {
                const span = seg.endAngle - seg.startAngle;
                if (span <= 0) return null;
                const midR = (r + innerR) / 2;
                const midAngle = ((seg.startAngle + seg.endAngle) / 2 - 90) * (Math.PI / 180);
                const labelX = cx + midR * Math.cos(midAngle);
                const labelY = cy + midR * Math.sin(midAngle);
                return (
                  <g key={i}>
                    <path
                      d={`${describeArc(cx, cy, r, seg.startAngle, seg.endAngle)} L ${cx + innerR * Math.cos(((seg.endAngle - 90) * Math.PI) / 180)} ${cy + innerR * Math.sin(((seg.endAngle - 90) * Math.PI) / 180)} A ${innerR} ${innerR} 0 ${seg.endAngle - seg.startAngle > 180 ? 1 : 0} 0 ${cx + innerR * Math.cos(((seg.startAngle - 90) * Math.PI) / 180)} ${cy + innerR * Math.sin(((seg.startAngle - 90) * Math.PI) / 180)} Z`}
                      fill={seg.color}
                      opacity={0.9}
                    />
                    {span > 15 && (
                      <text
                        x={labelX}
                        y={labelY}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={9}
                        fill="white"
                        fontWeight="bold"
                      >
                        {seg.item.porcentaje.toFixed(2)}%
                      </text>
                    )}
                  </g>
                );
              })
            )}

            {/* Remaining (gray) */}
            {remaining > 0.01 && !isOverflow && segments.length > 0 && (
              <path
                d={`${describeArc(cx, cy, r, (totalPct / 100) * 360, 360)} L ${cx + innerR * Math.cos(((360 - 90) * Math.PI) / 180)} ${cy + innerR * Math.sin(((360 - 90) * Math.PI) / 180)} A ${innerR} ${innerR} 0 ${360 - (totalPct / 100) * 360 > 180 ? 1 : 0} 0 ${cx + innerR * Math.cos(((((totalPct / 100) * 360) - 90) * Math.PI) / 180)} ${cy + innerR * Math.sin(((((totalPct / 100) * 360) - 90) * Math.PI) / 180)} Z`}
                fill="#e2e8f0"
                opacity={0.6}
              />
            )}

            {/* Center text */}
            <text x={cx} y={cy - 8} textAnchor="middle" fontSize={20} fontWeight="bold" fill={isOverflow ? '#f43f5e' : '#1e293b'}>
              {totalPct.toFixed(2)}%
            </text>
            <text x={cx} y={cy + 10} textAnchor="middle" fontSize={9} fill="#94a3b8">
              {isOverflow ? 'EXCEDE 100%' : `${remaining.toFixed(2)}% libre`}
            </text>
          </svg>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-2.5">
          {activeItems.map(item => {
            const cfg = COLOR_CONFIG[item.color ?? 'emerald'] ?? COLOR_CONFIG.emerald;
            return (
              <div key={item.id} className="flex items-center gap-2.5">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.hex }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700 truncate">{item.nombre}</span>
                    <span className="text-xs font-bold tabular-nums flex-shrink-0" style={{ color: cfg.hex }}>
                      {item.porcentaje.toFixed(2)}%
                    </span>
                  </div>
                  <div className="h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(item.porcentaje, 100)}%`, backgroundColor: cfg.hex }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          {remaining > 0.01 && !isOverflow && (
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full flex-shrink-0 bg-slate-200" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-400 italic">Sin asignar</span>
                  <span className="text-xs font-bold tabular-nums text-slate-400">{remaining.toFixed(2)}%</span>
                </div>
                <div className="h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                  <div className="h-full rounded-full bg-slate-200" style={{ width: `${remaining}%` }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
