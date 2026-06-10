import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  moduleKey?: string;
}

export default function ProtectedRoute({ children, moduleKey }: ProtectedRouteProps) {
  const { user, loading, canView } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-emerald-500">
            <i className="ri-bar-chart-box-line text-white text-xl animate-pulse" />
          </div>
          <p className="text-slate-500 text-sm">Cargando sistema...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (moduleKey && !canView(moduleKey)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center max-w-md px-8">
          <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-slate-100 mx-auto mb-4">
            <i className="ri-lock-2-line text-slate-400 text-3xl" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 font-[Sora] mb-2">Acceso restringido</h2>
          <p className="text-slate-500 text-sm">
            No tienes permisos para acceder a este módulo. Contacta al administrador.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
