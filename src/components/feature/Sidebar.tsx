import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { MODULES } from '@/types/auth';

const MODULE_PATHS: Record<string, string> = {
  dashboard: '/',
  areas: '/areas',
  distribucion: '/distribucion',
  inversion: '/inversion',
  costos: '/costos',
  'costos-outbound': '/costos-outbound',
  'costos-crossdocking': '/costos-crossdocking',
  'costos-inbound': '/costos-inbound',
  almacen: '/almacen',
  cotizaciones: '/cotizaciones',
  'mano-obra': '/mano-obra',
  'gastos-varios': '/gastos-varios',
  volumenes: '/volumenes',
  'vol-distribucion': '/vol-distribucion',
  factores: '/factores',
  configuracion: '/configuracion',
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, role, canView, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const visibleModules = MODULES.filter((m) => canView(m.key));

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-slate-900 flex flex-col z-30 transition-all duration-300 ease-in-out ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo + Toggle */}
      <div className={`border-b border-slate-700/60 flex items-center ${collapsed ? 'px-3 py-6 justify-center' : 'px-4 py-6'}`}>
        {!collapsed && (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg bg-emerald-500">
              <i className="ri-bar-chart-box-line text-white text-lg" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-tight">CostOp</p>
              <p className="text-slate-400 text-xs">Costos de Operación</p>
            </div>
          </div>
        )}

        {collapsed && (
          <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-emerald-500">
            <i className="ri-bar-chart-box-line text-white text-lg" />
          </div>
        )}

        <button
          onClick={onToggle}
          className={`w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer transition-colors shrink-0 ${
            collapsed ? 'absolute -right-3 top-7 bg-slate-800 border border-slate-600 shadow-lg' : 'ml-2'
          }`}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          <i className={`text-sm transition-transform duration-300 ${collapsed ? 'ri-arrow-right-s-line' : 'ri-arrow-left-s-line'}`} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
        {!collapsed && (
          <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Módulos</p>
        )}
        {collapsed && <div className="mb-2" />}

        {[
          ...visibleModules.filter((m) => m.key !== 'configuracion'),
          { key: 'cotizaciones', label: 'Cotizaciones', icon: 'ri-file-list-3-line' },
          { key: 'vol-distribucion', label: 'Dist. Volumen', icon: 'ri-pie-chart-2-line' },
          { key: 'factores', label: 'Factores', icon: 'ri-equalizer-line' },
          { key: 'costos-outbound', label: 'Costos Outbound', icon: 'ri-archive-line' },
          { key: 'costos-crossdocking', label: 'Costos Crossdocking', icon: 'ri-arrow-left-right-line' },
          { key: 'costos-inbound', label: 'Costos Inbound', icon: 'ri-logout-box-line' },
          { key: 'almacen', label: 'Almacén', icon: 'ri-store-2-line' },
        ].map((item) => {
            const path = MODULE_PATHS[item.key];
            const isActive =
              location.pathname === path ||
              (path !== '/' && location.pathname.startsWith(path));
            return (
              <NavLink
                key={item.key}
                to={path}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap group ${
                  collapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2.5'
                } ${
                  isActive
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent'
                }`}
              >
                <div className="w-5 h-5 flex items-center justify-center shrink-0">
                  <i className={`${item.icon} text-base`} />
                </div>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}

        {/* Configuración separado */}
        {canView('configuracion') && (
          <>
            <div className="pt-3 pb-1">
              {!collapsed && (
                <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Sistema</p>
              )}
              {collapsed && <div className="border-t border-slate-700/50 mx-2" />}
            </div>
            <NavLink
              to="/configuracion"
              title={collapsed ? 'Configuración' : undefined}
              className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                collapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2.5'
              } ${
                location.pathname.startsWith('/configuracion')
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent'
              }`}
            >
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                <i className="ri-settings-3-line text-base" />
              </div>
              {!collapsed && <span className="truncate">Configuración</span>}
            </NavLink>
          </>
        )}
      </nav>

      {/* Footer: user info + logout */}
      <div className={`border-t border-slate-700/60 ${collapsed ? 'px-2 py-4' : 'px-4 py-4'}`}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold"
              title={profile?.nombre ?? 'Usuario'}
            >
              {profile?.nombre?.charAt(0).toUpperCase() ?? 'U'}
            </div>
            <button
              onClick={handleSignOut}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer transition-colors"
              title="Cerrar sesión"
            >
              <i className="ri-logout-box-r-line text-sm" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold shrink-0">
              {profile?.nombre?.charAt(0).toUpperCase() ?? 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-300 text-xs font-medium truncate">{profile?.nombre ?? 'Usuario'}</p>
              <p className="text-slate-500 text-xs truncate">{role?.nombre ?? ''}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer transition-colors"
              title="Cerrar sesión"
            >
              <i className="ri-logout-box-r-line text-sm" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
