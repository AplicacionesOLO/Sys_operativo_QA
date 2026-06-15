import { useState, useEffect } from 'react';
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
  'costos-movimientos': '/costos-movimientos',
  'conteo-slots': '/conteo-slots',
  'zona-picking': '/zona-picking',
  almacen: '/almacen',
  cotizaciones: '/cotizaciones',
  'mano-obra': '/mano-obra',
  'gastos-varios': '/gastos-varios',
  volumenes: '/volumenes',
  'vol-distribucion': '/vol-distribucion',
  factores: '/factores',
  configuracion: '/configuracion',
};

// Items that live inside the "Costos" collapsible group
const COSTOS_GROUP = [
  { key: 'costos-outbound',    label: 'Costos Outbound',     icon: 'ri-archive-line' },
  { key: 'costos-crossdocking',label: 'Costos Crossdocking', icon: 'ri-arrow-left-right-line' },
  { key: 'costos-inbound',     label: 'Costos Inbound',      icon: 'ri-logout-box-line' },
  { key: 'costos-movimientos', label: 'Costos Movimientos',  icon: 'ri-truck-line' },
  { key: 'conteo-slots',       label: 'Costos de Slots',     icon: 'ri-layout-grid-line' },
  { key: 'zona-picking',       label: 'Costo Zona Picking',  icon: 'ri-map-pin-line' },
  { key: 'almacen',            label: 'Costos Almacén',      icon: 'ri-store-2-line' },
];

const COSTOS_PATHS = COSTOS_GROUP.map(i => MODULE_PATHS[i.key]);

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, role, canView, signOut } = useAuth();

  const isCostosActive = COSTOS_PATHS.some(p => location.pathname === p || location.pathname.startsWith(p + '/'));
  const [costosOpen, setCostosOpen] = useState(isCostosActive);

  // Auto-open group when navigating to a costos sub-route
  useEffect(() => {
    if (isCostosActive) setCostosOpen(true);
  }, [isCostosActive]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const visibleModules = MODULES.filter((m) => canView(m.key));

  // Shared nav link class builder
  const navClass = (isActive: boolean, extra = '') =>
    `flex items-center gap-3 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap group ${
      collapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2.5'
    } ${
      isActive
        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
        : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent'
    } ${extra}`;

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

        {/* ── Regular modules (from permissions + fixed ones) ── */}
        {[
          ...visibleModules.filter((m) => m.key !== 'configuracion'),
          { key: 'cotizaciones',   label: 'Cotizaciones',   icon: 'ri-file-list-3-line' },
          { key: 'vol-distribucion', label: 'Dist. Volumen', icon: 'ri-pie-chart-2-line' },
          { key: 'factores',       label: 'Factores',       icon: 'ri-equalizer-line' },
        ].map((item) => {
          const path = MODULE_PATHS[item.key];
          if (!path) return null;
          const isActive = location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
          return (
            <NavLink
              key={item.key}
              to={path}
              title={collapsed ? item.label : undefined}
              className={navClass(isActive)}
            >
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                <i className={`${item.icon} text-base`} />
              </div>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          );
        })}

        {/* ── Costos group ── */}
        {!collapsed ? (
          // Expanded sidebar: collapsible group
          <div className="space-y-0.5">
            <button
              onClick={() => setCostosOpen(v => !v)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                isCostosActive
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent'
              }`}
              title="Módulos de Costos"
            >
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                <i className="ri-coins-line text-base" />
              </div>
              <span className="truncate flex-1 text-left">Costos</span>
              <i className={`text-xs transition-transform duration-200 ${costosOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}`} />
            </button>

            {costosOpen && (
              <div className="ml-3 pl-3 border-l border-slate-700/60 space-y-0.5 py-1">
                {COSTOS_GROUP.map(item => {
                  const path = MODULE_PATHS[item.key];
                  const isActive = location.pathname === path || location.pathname.startsWith(path + '/');
                  return (
                    <NavLink
                      key={item.key}
                      to={path}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                        isActive
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent'
                      }`}
                    >
                      <div className="w-4 h-4 flex items-center justify-center shrink-0">
                        <i className={`${item.icon} text-sm`} />
                      </div>
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          // Collapsed sidebar: show a single group icon
          // Clicking expands sidebar + opens group; individual items still accessible via tooltip
          <>
            <button
              onClick={() => { onToggle(); setCostosOpen(true); }}
              className={`w-full flex items-center justify-center py-2.5 rounded-lg text-sm transition-all cursor-pointer ${
                isCostosActive
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent'
              }`}
              title="Costos (expandir menú)"
            >
              <div className="w-5 h-5 flex items-center justify-center">
                <i className="ri-coins-line text-base" />
              </div>
            </button>
          </>
        )}

        {/* ── Sistema: Configuración + Bitácora (admin only) ── */}
        {(canView('configuracion') || role?.nombre === 'Administrador') && (
          <>
            <div className="pt-3 pb-1">
              {!collapsed && (
                <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Sistema</p>
              )}
              {collapsed && <div className="border-t border-slate-700/50 mx-2" />}
            </div>

            {canView('configuracion') && (
              <NavLink
                to="/configuracion"
                title={collapsed ? 'Configuración' : undefined}
                className={navClass(location.pathname.startsWith('/configuracion'))}
              >
                <div className="w-5 h-5 flex items-center justify-center shrink-0">
                  <i className="ri-settings-3-line text-base" />
                </div>
                {!collapsed && <span className="truncate">Configuración</span>}
              </NavLink>
            )}

            {role?.nombre === 'Administrador' && (
              <NavLink
                to="/bitacora"
                title={collapsed ? 'Bitácora de Cambios' : undefined}
                className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                  collapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2.5'
                } ${
                  location.pathname.startsWith('/bitacora')
                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent'
                }`}
              >
                <div className="w-5 h-5 flex items-center justify-center shrink-0">
                  <i className="ri-history-line text-base" />
                </div>
                {!collapsed && <span className="truncate">Bitácora</span>}
              </NavLink>
            )}
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
