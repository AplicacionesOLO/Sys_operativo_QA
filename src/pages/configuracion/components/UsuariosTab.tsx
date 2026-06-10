import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { ProfileWithRole } from '@/types/auth';
import UsuarioModal from './UsuarioModal';

export default function UsuariosTab() {
  const [users, setUsers] = useState<ProfileWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<ProfileWithRole | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*, role:roles(*)')
      .order('nombre');
    setUsers((data as ProfileWithRole[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleToggleEstado = async (u: ProfileWithRole) => {
    const newEstado = u.estado === 'activo' ? 'inactivo' : 'activo';
    await supabase.from('profiles').update({ estado: newEstado }).eq('id', u.id);
    fetchUsers();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('profiles').delete().eq('id', id);
    setDeleteConfirm(null);
    fetchUsers();
  };

  const filtered = users.filter(
    (u) =>
      u.nombre.toLowerCase().includes(search.toLowerCase()) ||
      u.correo.toLowerCase().includes(search.toLowerCase()) ||
      (u.role?.nombre ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="relative flex-1 max-w-xs">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-slate-400">
            <i className="ri-search-line text-sm" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar usuario..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
          />
        </div>
        <button
          onClick={() => { setEditUser(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-user-add-line text-sm" />
          Nuevo usuario
        </button>
      </div>

      {/* Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Usuario</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Correo</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rol</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-10 text-slate-400 text-sm">Cargando usuarios...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-slate-400 text-sm">No se encontraron usuarios.</td></tr>
            ) : filtered.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold shrink-0">
                      {u.nombre.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-slate-800">{u.nombre}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-500">{u.correo}</td>
                <td className="px-4 py-3">
                  {u.role ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">
                      <i className="ri-shield-line text-xs" />{u.role.nombre}
                    </span>
                  ) : (
                    <span className="text-slate-400 text-xs italic">Sin rol</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleEstado(u)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap transition-colors ${
                      u.estado === 'activo'
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${u.estado === 'activo' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    {u.estado === 'activo' ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => { setEditUser(u); setShowModal(true); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 cursor-pointer"
                      title="Editar"
                    >
                      <i className="ri-edit-line text-sm" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(u.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500 cursor-pointer"
                      title="Eliminar"
                    >
                      <i className="ri-delete-bin-line text-sm" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modales */}
      {showModal && (
        <UsuarioModal
          onClose={() => setShowModal(false)}
          onSaved={fetchUsers}
          editUser={editUser}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-sm mx-4 border border-slate-200 p-6">
            <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-50 mx-auto mb-4">
              <i className="ri-delete-bin-line text-red-500 text-xl" />
            </div>
            <h3 className="text-center font-semibold text-slate-800 mb-2">¿Eliminar usuario?</h3>
            <p className="text-center text-sm text-slate-500 mb-6">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap">Cancelar</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg cursor-pointer whitespace-nowrap font-medium">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
