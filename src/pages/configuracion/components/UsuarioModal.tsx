import { useState, useEffect, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { Role } from '@/types/auth';

interface UsuarioModalProps {
  onClose: () => void;
  onSaved: () => void;
  editUser?: {
    id: string;
    nombre: string;
    correo: string;
    rol_id: string | null;
    estado: 'activo' | 'inactivo';
  } | null;
}

export default function UsuarioModal({ onClose, onSaved, editUser }: UsuarioModalProps) {
  const [nombre, setNombre] = useState(editUser?.nombre ?? '');
  const [correo, setCorreo] = useState(editUser?.correo ?? '');
  const [password, setPassword] = useState('');
  const [rolId, setRolId] = useState(editUser?.rol_id ?? '');
  const [estado, setEstado] = useState<'activo' | 'inactivo'>(editUser?.estado ?? 'activo');
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);

  const isEditing = !!editUser;

  useEffect(() => {
    supabase.from('roles').select('*').order('nombre').then(({ data }) => {
      if (data) setRoles(data);
    });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!nombre.trim()) { setError('El nombre es requerido.'); return; }
    if (!correo.trim()) { setError('El correo es requerido.'); return; }
    const emailReg = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailReg.test(correo)) { setError('Ingresa un correo válido.'); return; }
    if (!isEditing && !password) { setError('La contraseña es requerida.'); return; }
    if (!isEditing && password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (!rolId) { setError('Selecciona un rol.'); return; }

    setLoading(true);

    if (isEditing) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ nombre, rol_id: rolId, estado, updated_at: new Date().toISOString() })
        .eq('id', editUser.id);

      if (profileError) { setError(profileError.message); setLoading(false); return; }
    } else {
      const { data: authData, error: authError } = await supabase.auth.admin
        ? { data: null, error: { message: 'Use invite flow' } }
        : { data: null, error: { message: 'Admin API not available in client' } };

      // Use signUp approach for new users
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: correo,
        password,
        options: {
          data: { nombre },
        },
      });

      if (signUpError) { setError(signUpError.message); setLoading(false); return; }
      if (authData) { /* handled */ }

      if (signUpData.user) {
        await supabase.from('profiles').upsert({
          id: signUpData.user.id,
          nombre,
          correo,
          rol_id: rolId,
          estado,
          updated_at: new Date().toISOString(),
        });
      }
    }

    setLoading(false);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl w-full max-w-md mx-4 border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 text-base font-[Sora]">
            {isEditing ? 'Editar usuario' : 'Nuevo usuario'}
          </h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Nombre completo</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Juan García"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            />
          </div>

          {/* Correo */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Correo electrónico</label>
            <input
              type="text"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="correo@empresa.com"
              disabled={isEditing}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-400"
            />
            {isEditing && <p className="text-xs text-slate-400 mt-1">El correo no puede modificarse.</p>}
          </div>

          {/* Password (solo en creación) */}
          {!isEditing && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Contraseña</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-3 py-2 pr-9 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer w-4 h-4 flex items-center justify-center"
                >
                  <i className={`${showPass ? 'ri-eye-off-line' : 'ri-eye-line'} text-sm`} />
                </button>
              </div>
            </div>
          )}

          {/* Rol */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Rol asignado</label>
            <select
              value={rolId}
              onChange={(e) => setRolId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 bg-white"
            >
              <option value="">Seleccionar rol...</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.nombre}</option>
              ))}
            </select>
          </div>

          {/* Estado */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Estado</label>
            <div className="flex gap-3">
              {(['activo', 'inactivo'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setEstado(s)}
                  className={`flex-1 py-2 text-sm rounded-lg border transition-all cursor-pointer whitespace-nowrap font-medium capitalize ${
                    estado === s
                      ? s === 'activo'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                        : 'bg-slate-100 border-slate-400 text-slate-700'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {s === 'activo' ? 'Activo' : 'Inactivo'}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <i className="ri-error-warning-line text-red-500 text-sm shrink-0" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="flex-1 py-2 text-sm bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap font-medium flex items-center justify-center gap-2">
              {loading ? <i className="ri-loader-4-line animate-spin text-sm" /> : null}
              {isEditing ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
