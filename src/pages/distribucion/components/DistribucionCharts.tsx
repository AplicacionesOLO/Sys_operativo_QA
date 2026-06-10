import { useMemo } from 'react';
import type { AreaDistribution } from '../../../types/areas';
import { TIPO_COLORS } from '../../../types/areas';

type FilterCategoria = 'all' | 'Interior' | 'Exterior';

type DistMode = 'm2' | 'm3';

interface DistribucionChartsProps {
  data: AreaDistribution[];
  tiposUnicos: { tipo: string; color: string | null; icon: string | null }[];
  filterCategoria: FilterCategoria;
  distMode: DistMode;
}

const COLOR_PALETTE: Record<string, string> = {
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  sky: '#0ea5e9',
  violet: '#8b5cf6',
  orange: '#f97316',
  default: '#94a3b8',
};

function HorizontalBar({ label, value, max, hexColor, subLabel }: {
  label: string;
  value: number;
  max: number;
  hexColor: string;
  subLabel?: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-4">
      <div className="w-32 shrink-0 text-right">
        <p className="text-xs font-medium text-slate-700 truncate">{label}</p>
        {subLabel && <p className="text-xs text-slate-400 truncate">{subLabel}</p>}
      </div>
      <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: hexColor }} />
      </div>
      <span className="w-14 text-right text-xs font-semibold text-slate-700 tabular-nums shrink-0">{value.toFixed(2)}%</span>
    </div>
  );
}

interface CategoryPanelProps {
  label: string;
  icon: string;
  iconColor: string;
  accentColor: string;
  hexColor: string;
  items: AreaDistribution[];
  showTypeBreakdown?: boolean;
  distMode: DistMode;
}

function CategoryPanel({ label, icon, iconColor, accentColor, hexColor, items, showTypeBreakdown, distMode }: CategoryPanelProps) {
  const isCubic = distMode === 'm3';
  const catPctField: keyof AreaDistribution = isCubic ? 'category_distribution_cubic_percentage' : 'category_distribution_percentage';
  const typePctField: keyof AreaDistribution = isCubic ? 'type_distribution_cubic_percentage' : 'type_distribution_percentage';
  const globalPctField: keyof AreaDistribution = isCubic ? 'global_distribution_cubic_percentage' : 'global_distribution_percentage';

  const sorted = [...items].sort((a, b) => (b[catPctField] as number) - (a[catPctField] as number));
  const maxCat = Math.max(...sorted.map((d) => d[catPctField] as number), 0);

  const typeAggregates = useMemo(() => {
    const map: Record<string, { color: string | null; icon: string | null; metric: number; catPct: number; count: number }> = {};
    items.forEach((d) => {
      if (!map[d.area_type]) map[d.area_type] = { color: d.area_type_color, icon: d.area_type_icon, metric: 0, catPct: 0, count: 0 };
      map[d.area_type].metric += isCubic ? d.cubic_meters : d.square_meters;
      map[d.area_type].catPct += d[catPctField] as number;
      map[d.area_type].count += 1;
    });
    return Object.entries(map)
      .map(([tipo, v]) => ({ tipo, ...v }))
      .sort((a, b) => b.catPct - a.catPct);
  }, [items, isCubic, catPctField]);

  const maxType = Math.max(...typeAggregates.map((t) => t.catPct), 0);

  if (items.length === 0) {
    return (
      <div className={`bg-white rounded-xl border-2 ${accentColor} p-5 flex flex-col items-center justify-center py-10`}>
        <i className={`${icon} ${iconColor} text-3xl mb-2`} />
        <p className="text-sm text-slate-400">Sin áreas en {label}</p>
      </div>
    );
  }

  const totalMetric = items.reduce((s, d) => s + (isCubic ? d.cubic_meters : d.square_meters), 0);

  return (
    <div className={`bg-white rounded-xl border-2 ${accentColor} p-5`}>
      <div className="flex items-center gap-2 mb-5">
        <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${label === 'Interior' ? 'bg-amber-50' : 'bg-sky-50'}`}>
          <i className={`${icon} ${iconColor} text-base`} />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">{label}</p>
          <p className="text-xs text-slate-400">{items.length} área{items.length !== 1 ? 's' : ''} · {totalMetric.toLocaleString()} {isCubic ? 'm³' : 'm²'}</p>
        </div>
      </div>

      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">% dentro de {label}</p>
      <div className="space-y-2.5 mb-5">
        {sorted.map((row) => (
          <HorizontalBar
            key={row.id}
            label={row.area_name}
            subLabel={`${isCubic ? row.cubic_meters.toLocaleString() + ' m³' : row.square_meters.toLocaleString() + ' m²'}`}
            value={row[catPctField] as number}
            max={maxCat}
            hexColor={hexColor}
          />
        ))}
      </div>

      {showTypeBreakdown && typeAggregates.length > 1 && (
        <>
          <div className="border-t border-slate-100 my-4" />
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Por tipo dentro de {label}</p>
          <div className="space-y-2.5">
            {typeAggregates.map((t) => (
              <HorizontalBar
                key={t.tipo}
                label={t.tipo}
                subLabel={`${t.count} área${t.count !== 1 ? 's' : ''} · ${t.metric.toLocaleString()} ${isCubic ? 'm³' : 'm²'}`}
                value={t.catPct}
                max={maxType}
                hexColor={COLOR_PALETTE[t.color ?? ''] ?? COLOR_PALETTE.default}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function DistribucionCharts({ data, tiposUnicos, filterCategoria, distMode }: DistribucionChartsProps) {
  const isCubic = distMode === 'm3';
  const catPctField: keyof AreaDistribution = isCubic ? 'category_distribution_cubic_percentage' : 'category_distribution_percentage';
  const globalPctField: keyof AreaDistribution = isCubic ? 'global_distribution_cubic_percentage' : 'global_distribution_percentage';

  const interiorData = useMemo(() => data.filter((d) => d.categoria === 'Interior'), [data]);
  const exteriorData = useMemo(() => data.filter((d) => d.categoria === 'Exterior'), [data]);

  const typeAggregates = useMemo(() =>
    tiposUnicos.map((t) => {
      const items = data.filter((d) => d.area_type === t.tipo);
      return {
        ...t,
        totalPct: items.reduce((s, d) => s + (d[globalPctField] as number), 0),
        totalMetric: items.reduce((s, d) => s + (isCubic ? d.cubic_meters : d.square_meters), 0),
        count: items.length,
      };
    }).sort((a, b) => b.totalPct - a.totalPct),
  [tiposUnicos, data, isCubic, globalPctField]);
  const maxTypePct = Math.max(...typeAggregates.map((t) => t.totalPct), 0);

  const maxGlobal = Math.max(...data.map((d) => d[globalPctField] as number), 0);

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center py-16">
        <p className="text-sm text-slate-400">No hay datos para visualizar.</p>
      </div>
    );
  }

  if (filterCategoria !== 'all') {
    return (
      <div className="grid grid-cols-2 gap-5">
        <CategoryPanel
          label={filterCategoria}
          icon={filterCategoria === 'Interior' ? 'ri-home-4-line' : 'ri-sun-line'}
          iconColor={filterCategoria === 'Interior' ? 'text-amber-500' : 'text-sky-500'}
          accentColor={filterCategoria === 'Interior' ? 'border-amber-200' : 'border-sky-200'}
          hexColor={filterCategoria === 'Interior' ? '#f59e0b' : '#0ea5e9'}
          items={data}
          showTypeBreakdown
          distMode={distMode}
        />
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-50">
                <i className="ri-global-line text-emerald-600 text-sm" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Peso Global</p>
                <p className="text-xs text-slate-400">% de cada área sobre el total general</p>
              </div>
            </div>
            <div className="space-y-3">
              {[...data].sort((a, b) => (b[globalPctField] as number) - (a[globalPctField] as number)).map((row) => (
                <HorizontalBar
                  key={row.id}
                  label={row.area_name}
                  subLabel={`${isCubic ? row.cubic_meters.toLocaleString() + ' m³' : row.square_meters.toLocaleString() + ' m²'}`}
                  value={row[globalPctField] as number}
                  max={maxGlobal}
                  hexColor="#10b981"
                />
              ))}
            </div>
          </div>

          {typeAggregates.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100">
                  <i className="ri-stack-line text-slate-600 text-sm" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Por Tipo de Área</p>
                  <p className="text-xs text-slate-400">Peso global por tipo</p>
                </div>
              </div>
              <div className="space-y-3">
                {typeAggregates.map((t) => (
                  <div key={t.tipo} className="space-y-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_COLORS[t.color ?? ''] ?? 'bg-slate-100 text-slate-600'}`}>
                        {t.icon && <i className={`${t.icon} text-xs`} />}
                        {t.tipo}
                      </span>
                    </div>
                    <HorizontalBar
                      label={`${t.count} área${t.count !== 1 ? 's' : ''}`}
                      subLabel={`${t.totalMetric.toLocaleString()} ${isCubic ? 'm³' : 'm²'}`}
                      value={t.totalPct}
                      max={maxTypePct}
                      hexColor={COLOR_PALETTE[t.color ?? ''] ?? COLOR_PALETTE.default}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-5">
        <CategoryPanel
          label="Interior"
          icon="ri-home-4-line"
          iconColor="text-amber-500"
          accentColor="border-amber-200"
          hexColor="#f59e0b"
          items={interiorData}
          showTypeBreakdown
          distMode={distMode}
        />
        <CategoryPanel
          label="Exterior"
          icon="ri-sun-line"
          iconColor="text-sky-500"
          accentColor="border-sky-200"
          hexColor="#0ea5e9"
          items={exteriorData}
          showTypeBreakdown
          distMode={distMode}
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-50">
            <i className="ri-global-line text-emerald-600 text-sm" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Distribución Global — Todas las áreas</p>
            <p className="text-xs text-slate-400">% de cada área sobre el total general (Interior + Exterior)</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-10 gap-y-3">
          {[...data].sort((a, b) => (b[globalPctField] as number) - (a[globalPctField] as number)).map((row) => {
            const isInteriorRow = row.categoria === 'Interior';
            const hexColor = isInteriorRow ? '#f59e0b' : row.categoria === 'Exterior' ? '#0ea5e9' : '#94a3b8';
            return (
              <HorizontalBar
                key={row.id}
                label={row.area_name}
                subLabel={`${row.categoria} · ${isCubic ? row.cubic_meters.toLocaleString() + ' m³' : row.square_meters.toLocaleString() + ' m²'}`}
                value={row[globalPctField] as number}
                max={maxGlobal}
                hexColor={hexColor}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}