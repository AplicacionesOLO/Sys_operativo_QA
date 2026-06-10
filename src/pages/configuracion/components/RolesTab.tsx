import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Role, RolePermission, MODULES } from '@/types/auth';
import RolModal from './RolModal';

interface RoleWithPerms extends Role {
  permissions: RolePermission[];
}

export default function RolesTab() {
  const [roles, setRoles] = useState<RoleWithPerms[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    const { data: rolesData } = await supabase.from('roles').select('*').order('nombre');
    const { data: permsData } = await supabase.from('role_permissions').select('*');

    const permsMap: Record<string, RolePermission[]> = {};
    (permsData ?? []).forEach((p: RolePermission) => {
      if (!permsMap[p.rol_id]) permsMap[p.rol_id] = [];
      permsMap[p.rol_id].push(p);
    });

    setRoles(
      (rolesData ?? []).map((r: Role) => ({
        ...r,
        permissions: permsMap[r.id] ?? [],
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  const handleDelete = async (id: string) => {
    await supabase.from('roles').delete().eq('id', id);
    setDeleteConfirm(null);
    fetchRoles();
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-slate-500">
          {roles.length} {roles.length === 1 ? 'rol configurado' : 'roles configurados'}
        </p>
        <button
          onClick={() => { setEditRole(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-shield-line text-sm" />
          Nuevo rol
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-slate-400 text-sm">Cargando roles...</div>
      ) : roles.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">No hay roles configurados.</div>
      ) : (
        <div className="space-y-3">
          {roles.map((r) => {
            const visibleModules = r.permissions.filter((p) => p.can_view);
            const isExpanded = expandedRole === r.id;

            return (
              <div key={r.id} className="border border-slate-200 rounded-xl overflow-hidden">
                {/* Row header */}
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-emerald-50 shrink-0">
                    <i className="ri-shield-star-line text-emerald-600 text-base" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm">{r.nombre}</p>
                    {r.descripcion && <p className="text-xs text-slate-500 truncate">{r.descripcion}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-500">
                      {visibleModules.length}/{MODULES.length} módulos
                    </span>
                    <button
                      onClick={() => setExpandedRole(isExpanded ? null : r.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
                      title="Ver permisos"
                    >
                      <i className={isExpanded ? 'ri-arrow-up-s-line text-base' : 'ri-arrow-down-s-line text-base'} />
                    </button>
                    <button
                      onClick={() => { setEditRole(r); setShowModal(true); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 cursor-pointer"
                      title="Editar"
                    >
                      <i className="ri-edit-line text-sm" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(r.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500 cursor-pointer"
                      title="Eliminar"
                    >
                      <i className="ri-delete-bin-line text-sm" />
                    </button>
                  </div>
                </div>

                {/* Permissions expand */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-5 py-4 bg-slate-50">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Permisos de visualización</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {MODULES.map((mod) => {
                        const hasPerm = r.permissions.find((p) => p.module_key === mod.key)?.can_view ?? false;
                        return (
                          <div
                            key={mod.key}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors ${
                              hasPerm
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : 'bg-white border-slate-200 text-slate-400'
                            }`}
                          >
                            <div className="w-3 h-3 flex items-center justify-center shrink-0">
                              <i className={`${hasPerm ? 'ri-checkbox-circle-fill text-emerald-500' : 'ri-checkbox-blank-circle-line text-slate-300'} text-xs`} />
                            </div>
                            <span className="truncate">{mod.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modales */}
      {showModal && (
        <RolModal
          onClose={() => setShowModal(false)}
          onSaved={fetchRoles}
          editRole={editRole}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-sm mx-4 border border-slate-200 p-6">
            <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-50 mx-auto mb-4">
              <i className="ri-delete-bin-line text-red-500 text-xl" />
            </div>
            <h3 className="text-center font-semibold text-slate-800 mb-2">¿Eliminar rol?</h3>
            <p className="text-center text-sm text-slate-500 mb-6">Los usuarios con este rol quedarán sin rol asignado.</p>
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
