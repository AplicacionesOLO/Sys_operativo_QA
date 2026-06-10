import type { AreaDistribution } from '../../../types/areas';

type FilterCategoria = 'all' | 'Interior' | 'Exterior';

type DistMode = 'm2' | 'm3';

interface DistribucionStatsProps {
  data: AreaDistribution[];
  dataM2: AreaDistribution[];
  dataM3: AreaDistribution[];
  filterCategoria: FilterCategoria;
  interiorData: AreaDistribution[];
  exteriorData: AreaDistribution[];
  distMode: DistMode;
}

interface StatCardProps {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
}

function StatCard({ icon, iconBg, iconColor, label, value, sub, subColor }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
      <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${iconBg} shrink-0`}>
        <i className={`${icon} text-lg ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-base font-bold text-slate-800 truncate">{value}</p>
        {sub && <p className={`text-xs font-medium ${subColor ?? 'text-slate-400'}`}>{sub}</p>}
      </div>
    </div>
  );
}

function CategoryMiniCard({ label, icon, iconColor, count, metric, unit, percentage, accent }: {
  label: string;
  icon: string;
  iconColor: string;
  count: number;
  metric: number;
  unit: string;
  percentage: number;
  accent: string;
}) {
  return (
    <div className={`bg-white rounded-xl border-2 ${accent} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <i className={`${icon} ${iconColor} text-base`} />
          <span className="text-sm font-semibold text-slate-800">{label}</span>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          label === 'Interior' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
        }`}>{percentage.toFixed(2)}% del total</span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-bold text-slate-800">{count}</p>
          <p className="text-xs text-slate-500">área{count !== 1 ? 's' : ''}</p>
        </div>
        <div className="text-right">
          <p className="text-base font-bold text-slate-700">{metric.toLocaleString()}</p>
          <p className="text-xs text-slate-500">metros{unit}</p>
        </div>
      </div>
    </div>
  );
}

export default function DistribucionStats({ data, dataM2, dataM3, filterCategoria, interiorData, exteriorData, distMode }: DistribucionStatsProps) {
  const isCubic = distMode === 'm3';

  const activeData = filterCategoria === 'all' ? data : filterCategoria === 'Interior' ? interiorData : exteriorData;
  const totalM2 = dataM2.reduce((s, d) => s + d.square_meters, 0);
  const totalM3 = dataM3.reduce((s, d) => s + d.cubic_meters, 0);
  const activeTotal = isCubic
    ? activeData.reduce((s, d) => s + d.cubic_meters, 0)
    : activeData.reduce((s, d) => s + d.square_meters, 0);
  const activeTop = activeData.length > 0
    ? [...activeData].sort((a, b) =>
        isCubic ? b.cubic_meters - a.cubic_meters : b.square_meters - a.square_meters
      )[0]
    : null;

  const tiposCount = new Set(activeData.map((d) => d.area_type)).size;

  const interiorM2 = dataM2.filter((d) => d.categoria === 'Interior').reduce((s, d) => s + d.square_meters, 0);
  const exteriorM2 = dataM2.filter((d) => d.categoria === 'Exterior').reduce((s, d) => s + d.square_meters, 0);
  const interiorM3 = dataM3.filter((d) => d.categoria === 'Interior').reduce((s, d) => s + d.cubic_meters, 0);
  const exteriorM3 = dataM3.filter((d) => d.categoria === 'Exterior').reduce((s, d) => s + d.cubic_meters, 0);

  const interiorPct = isCubic
    ? (totalM3 > 0 ? (interiorM3 / totalM3) * 100 : 0)
    : (totalM2 > 0 ? (interiorM2 / totalM2) * 100 : 0);
  const exteriorPct = isCubic
    ? (totalM3 > 0 ? (exteriorM3 / totalM3) * 100 : 0)
    : (totalM2 > 0 ? (exteriorM2 / totalM2) * 100 : 0);

  if (filterCategoria === 'all') {
    return (
      <div className="mb-6 space-y-4">
        {/* Global summary row */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            icon="ri-map-pin-2-line"
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
            label="Total Áreas"
            value={String(data.length)}
            sub={`${dataM2.filter(d => d.categoria === 'Interior').length} int. · ${dataM2.filter(d => d.categoria === 'Exterior').length} ext.`}
          />
          <StatCard
            icon={isCubic ? 'ri-box-3-line' : 'ri-ruler-2-line'}
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
            label={isCubic ? 'Total m³ General' : 'Total m² General'}
            value={`${isCubic ? totalM3.toLocaleString() + ' m³' : totalM2.toLocaleString() + ' m²'}`}
            sub={isCubic ? `${interiorM3.toLocaleString()} int. · ${exteriorM3.toLocaleString()} ext.` : `${interiorM2.toLocaleString()} int. · ${exteriorM2.toLocaleString()} ext.`}
          />
          <StatCard
            icon="ri-trophy-line"
            iconBg="bg-rose-50"
            iconColor="text-rose-500"
            label="Área de mayor peso"
            value={activeTop?.area_name ?? '—'}
            sub={activeTop
              ? (isCubic
                ? `${activeTop.global_distribution_cubic_percentage.toFixed(2)}% del total`
                : `${activeTop.global_distribution_percentage.toFixed(2)}% del total`)
              : undefined}
            subColor="text-rose-500"
          />
        </div>
        {/* Category breakdown */}
        <div className="grid grid-cols-2 gap-4">
          <CategoryMiniCard
            label="Interior"
            icon="ri-home-4-line"
            iconColor="text-amber-500"
            count={dataM2.filter(d => d.categoria === 'Interior').length}
            metric={isCubic ? interiorM3 : interiorM2}
            unit={isCubic ? 'm³' : 'm²'}
            percentage={interiorPct}
            accent="border-amber-200"
          />
          <CategoryMiniCard
            label="Exterior"
            icon="ri-sun-line"
            iconColor="text-sky-500"
            count={dataM2.filter(d => d.categoria === 'Exterior').length}
            metric={isCubic ? exteriorM3 : exteriorM2}
            unit={isCubic ? 'm³' : 'm²'}
            percentage={exteriorPct}
            accent="border-sky-200"
          />
        </div>
      </div>
    );
  }

  // Filtered by category
  const isInterior = filterCategoria === 'Interior';
  const catPct = isCubic
    ? (totalM3 > 0 ? (activeTotal / totalM3) * 100 : 0)
    : (totalM2 > 0 ? (activeTotal / totalM2) * 100 : 0);
  const topCatArea = [...activeData].sort((a, b) =>
    isCubic
      ? b.category_distribution_cubic_percentage - a.category_distribution_cubic_percentage
      : b.category_distribution_percentage - a.category_distribution_percentage
  )[0];

  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      <StatCard
        icon={isInterior ? 'ri-home-4-line' : 'ri-sun-line'}
        iconBg={isInterior ? 'bg-amber-50' : 'bg-sky-50'}
        iconColor={isInterior ? 'text-amber-500' : 'text-sky-500'}
        label={`Áreas ${filterCategoria}`}
        value={String(activeData.length)}
      />
      <StatCard
        icon={isCubic ? 'ri-box-3-line' : 'ri-ruler-2-line'}
        iconBg={isInterior ? 'bg-amber-50' : 'bg-sky-50'}
        iconColor={isInterior ? 'text-amber-600' : 'text-sky-600'}
        label={`Total ${isCubic ? 'm³' : 'm²'} ${filterCategoria}`}
        value={`${activeTotal.toLocaleString()} ${isCubic ? 'm³' : 'm²'}`}
        sub={`${catPct.toFixed(2)}% del total global`}
        subColor={isInterior ? 'text-amber-500' : 'text-sky-500'}
      />
      <StatCard
        icon="ri-stack-line"
        iconBg="bg-slate-100"
        iconColor="text-slate-600"
        label="Tipos de Área"
        value={String(tiposCount)}
      />
      <StatCard
        icon="ri-trophy-line"
        iconBg="bg-rose-50"
        iconColor="text-rose-500"
        label={`Mayor peso en ${filterCategoria}`}
        value={topCatArea?.area_name ?? '—'}
        sub={topCatArea
          ? (isCubic
            ? `${topCatArea.category_distribution_cubic_percentage.toFixed(2)}% de ${filterCategoria}`
            : `${topCatArea.category_distribution_percentage.toFixed(2)}% de ${filterCategoria}`)
          : undefined}
        subColor="text-rose-500"
      />
    </div>
  );
}
