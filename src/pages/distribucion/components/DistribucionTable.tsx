import type { AreaDistribution } from '../../../types/areas';

type FilterCategoria = 'all' | 'Interior' | 'Exterior';

type DistMode = 'm2' | 'm3';

interface DistribucionTableProps {
  data: AreaDistribution[];
  tipoColors: Record<string, string>;
  filterCategoria: FilterCategoria;
  distMode: DistMode;
}

function PercentBar({ value, colorClass }: { value: number; colorClass: string }) {
  const width = Math.min(value, 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden" style={{ minWidth: 60 }}>
        <div className={`h-full rounded-full transition-all ${colorClass}`} style={{ width: `${width}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-700 tabular-nums w-12 text-right">{value.toFixed(2)}%</span>
    </div>
  );
}

const COLOR_BAR: Record<string, string> = {
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  rose: 'bg-rose-400',
  sky: 'bg-sky-400',
  violet: 'bg-violet-400',
  orange: 'bg-orange-400',
  default: 'bg-slate-400',
};

function CategoriaBadge({ categoria }: { categoria: string }) {
  if (categoria === 'Interior') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
        <i className="ri-home-4-line text-xs" /> Interior
      </span>
    );
  }
  if (categoria === 'Exterior') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-700">
        <i className="ri-sun-line text-xs" /> Exterior
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
      Sin categoría
    </span>
  );
}

export default function DistribucionTable({ data, tipoColors, filterCategoria, distMode }: DistribucionTableProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center py-16">
        <p className="text-sm text-slate-400">No hay áreas para mostrar con ese filtro.</p>
      </div>
    );
  }

  const isCubic = distMode === 'm3';

  const maxGlobal = isCubic
    ? Math.max(...data.map((d) => d.global_distribution_cubic_percentage))
    : Math.max(...data.map((d) => d.global_distribution_percentage));
  const showCategoria = filterCategoria === 'all';
  const catLabel = filterCategoria !== 'all' ? `% de ${filterCategoria}` : '% de Categoría';

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Área</th>
            {showCategoria && (
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Categoría</th>
            )}
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
            <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{isCubic ? 'Metros³' : 'Metros²'}</th>
            <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide" style={{ minWidth: 180 }}>% Dentro del Tipo</th>
            <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide" style={{ minWidth: 180 }}>{catLabel}</th>
            <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide" style={{ minWidth: 180 }}>% Global</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => {
            const isTop = isCubic
              ? row.global_distribution_cubic_percentage === maxGlobal && maxGlobal > 0
              : row.global_distribution_percentage === maxGlobal && maxGlobal > 0;
            const barColor = COLOR_BAR[row.area_type_color ?? ''] ?? COLOR_BAR.default;
            const catBarColor = row.categoria === 'Interior' ? 'bg-amber-400' : row.categoria === 'Exterior' ? 'bg-sky-400' : 'bg-slate-300';

            return (
              <tr
                key={row.id}
                className={`border-b border-slate-100 transition-colors ${isTop ? 'bg-amber-50/40' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'} hover:bg-slate-50`}
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    {isTop && (
                      <div className="w-5 h-5 flex items-center justify-center">
                        <i className="ri-trophy-line text-amber-400 text-sm" />
                      </div>
                    )}
                    <p className="text-sm font-medium text-slate-800">{row.area_name}</p>
                  </div>
                </td>
                {showCategoria && (
                  <td className="px-5 py-3.5">
                    <CategoriaBadge categoria={row.categoria} />
                  </td>
                )}
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${tipoColors[row.area_type_color ?? ''] ?? 'bg-slate-100 text-slate-600'}`}>
                    {row.area_type_icon && <i className={`${row.area_type_icon} text-xs`} />}
                    {row.area_type}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  {isCubic ? (
                    row.cubic_meters > 0 ? (
                      <span className="text-sm font-semibold text-slate-700 tabular-nums">
                        {row.cubic_meters.toLocaleString()} m³
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )
                  ) : (
                    row.square_meters > 0 ? (
                      <span className="text-sm font-semibold text-slate-700 tabular-nums">
                        {row.square_meters.toLocaleString()} m²
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <PercentBar
                    value={isCubic ? row.type_distribution_cubic_percentage : row.type_distribution_percentage}
                    colorClass={barColor}
                  />
                </td>
                <td className="px-5 py-3.5">
                  <PercentBar
                    value={isCubic ? row.category_distribution_cubic_percentage : row.category_distribution_percentage}
                    colorClass={catBarColor}
                  />
                </td>
                <td className="px-5 py-3.5">
                  <PercentBar
                    value={isCubic ? row.global_distribution_cubic_percentage : row.global_distribution_percentage}
                    colorClass="bg-emerald-400"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 border-t border-slate-200">
            <td colSpan={showCategoria ? 3 : 2} className="px-5 py-3 text-xs font-semibold text-slate-500">
              {data.length} área{data.length !== 1 ? 's' : ''}
            </td>
            <td className="px-5 py-3 text-right text-xs font-bold text-slate-700">
              {isCubic
                ? data.reduce((s, d) => s + d.cubic_meters, 0).toLocaleString() + ' m³'
                : data.reduce((s, d) => s + d.square_meters, 0).toLocaleString() + ' m²'
              }
            </td>
            <td className="px-5 py-3 text-xs text-slate-400">—</td>
            <td className="px-5 py-3 text-xs text-slate-400">—</td>
            <td className="px-5 py-3 text-xs font-bold text-emerald-700">
              {isCubic
                ? data.reduce((s, d) => s + d.global_distribution_cubic_percentage, 0).toFixed(2) + '%'
                : data.reduce((s, d) => s + d.global_distribution_percentage, 0).toFixed(2) + '%'
              }
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
