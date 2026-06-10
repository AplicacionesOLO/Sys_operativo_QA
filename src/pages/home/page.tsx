import AppLayout from "../../components/feature/AppLayout";
import { Link } from "react-router-dom";

const modules = [
  {
    path: "/gastos",
    icon: "ri-money-dollar-circle-line",
    title: "Registro de Gastos",
    description: "Registra y gestiona los gastos operativos mensuales por área",
    color: "bg-amber-50 text-amber-600",
    status: "Próximamente",
  },
  {
    path: "/areas",
    icon: "ri-map-pin-2-line",
    title: "Catálogo de Áreas",
    description: "Administra las áreas y sus tipos para categorizar gastos",
    color: "bg-emerald-50 text-emerald-600",
    status: "Disponible",
  },
  {
    path: "/alertas",
    icon: "ri-alarm-warning-line",
    title: "Alertas de Presupuesto",
    description: "Recibe alertas automáticas cuando se excede el presupuesto",
    color: "bg-rose-50 text-rose-600",
    status: "Próximamente",
  },
  {
    path: "/exportar",
    icon: "ri-download-2-line",
    title: "Exportar Datos",
    description: "Descarga reportes en formato CSV y PDF",
    color: "bg-slate-100 text-slate-600",
    status: "Próximamente",
  },
];

export default function DashboardPage() {
  return (
    <AppLayout
      title="Dashboard"
      subtitle="Panel de resumen del sistema de costos de operación"
    >
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl p-8 mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full -translate-y-16 translate-x-16" />
        <div className="absolute bottom-0 right-20 w-40 h-40 bg-emerald-500/10 rounded-full translate-y-12" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 flex items-center justify-center">
              <i className="ri-bar-chart-box-line text-emerald-400 text-base" />
            </div>
            <span className="text-emerald-400 text-sm font-medium">Sistema de Costos de Operación</span>
          </div>
          <h2 className="text-white text-2xl font-bold font-[Sora] mb-2">
            Bienvenido a CostOp
          </h2>
          <p className="text-slate-400 text-sm max-w-lg">
            Registra, calcula y visualiza los gastos operativos de forma automática.
            Comienza configurando tu catálogo de áreas.
          </p>
          <Link
            to="/areas"
            className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <div className="w-4 h-4 flex items-center justify-center">
              <i className="ri-arrow-right-line" />
            </div>
            Ir al Catálogo de Áreas
          </Link>
        </div>
      </div>

      {/* Stats summary — placeholders */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Gasto Total del Mes", value: "$0.00", icon: "ri-wallet-3-line", sub: "Sin datos aún", color: "bg-emerald-50 text-emerald-600" },
          { label: "Áreas Configuradas", value: "8", icon: "ri-map-pin-2-line", sub: "Activas este mes", color: "bg-amber-50 text-amber-600" },
          { label: "Alertas Activas", value: "0", icon: "ri-alarm-warning-line", sub: "Todo en orden", color: "bg-rose-50 text-rose-500" },
          { label: "Reportes Generados", value: "0", icon: "ri-file-chart-line", sub: "Este mes", color: "bg-slate-100 text-slate-600" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-500 font-medium">{stat.label}</p>
              <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${stat.color}`}>
                <i className={`${stat.icon} text-base`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
            <p className="text-xs text-slate-400 mt-1">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Modules grid */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Módulos del sistema</h3>
        <div className="grid grid-cols-2 gap-4">
          {modules.map((mod) => (
            <Link
              key={mod.path}
              to={mod.path}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:border-emerald-300 transition-all cursor-pointer group"
            >
              <div className="flex items-start gap-4">
                <div className={`w-11 h-11 flex items-center justify-center rounded-xl ${mod.color}`}>
                  <i className={`${mod.icon} text-xl`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-semibold text-slate-800 group-hover:text-emerald-700 transition-colors">{mod.title}</h4>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${mod.status === "Disponible" ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                      {mod.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{mod.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
