import { useState, useEffect, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { RolePermission, MODULES } from '@/types/auth';

interface RolModalProps {
  onClose: () => void;
  onSaved: () => void;
  editRole?: {
    id: string;
    nombre: string;
    descripcion: string | null;
  } | null;
}

export default function RolModal({ onClose, onSaved, editRole }: RolModalProps) {
  const [nombre, setNombre] = useState(editRole?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(editRole?.descripcion ?? '');
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!editRole;

  useEffect(() => {
    if (isEditing) {
      supabase
        .from('role_permissions')
        .select('*')
        .eq('rol_id', editRole.id)
        .then(({ data }) => {
          const map: Record<string, boolean> = {};
          (data ?? []).forEach((p: RolePermission) => {
            map[p.module_key] = p.can_view;
          });
          setPerms(map);
        });
    } else {
      const initial: Record<string, boolean> = {};
      MODULES.forEach((m) => { initial[m.key] = false; });
      setPerms(initial);
    }
  }, [editRole, isEditing]);

  const togglePerm = (key: string) => {
    setPerms((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelectAll = () => {
    const all: Record<string, boolean> = {};
    MODULES.forEach((m) => { all[m.key] = true; });
    setPerms(all);
  };

  const handleClearAll = () => {
    const none: Record<string, boolean> = {};
    MODULES.forEach((m) => { none[m.key] = false; });
    setPerms(none);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!nombre.trim()) { setError('El nombre del rol es requerido.'); return; }

    setLoading(true);
    let roleId = editRole?.id;

    if (isEditing) {
      const { error: updateErr } = await supabase
        .from('roles')
        .update({ nombre, descripcion: descripcion || null, updated_at: new Date().toISOString() })
        .eq('id', editRole.id);
      if (updateErr) { setError(updateErr.message); setLoading(false); return; }
    } else {
      const { data, error: insertErr } = await supabase
        .from('roles')
        .insert({ nombre, descripcion: descripcion || null })
        .select()
        .single();
      if (insertErr) { setError(insertErr.message); setLoading(false); return; }
      roleId = data.id;
    }

    if (roleId) {
      // Delete existing permissions and re-insert
      await supabase.from('role_permissions').delete().eq('rol_id', roleId);
      const permRows = MODULES.map((m) => ({
        rol_id: roleId,
        module_key: m.key,
        can_view: perms[m.key] ?? false,
      }));
      await supabase.from('role_permissions').insert(permRows);
    }

    setLoading(false);
    onSaved();
    onClose();
  };

  const selectedCount = Object.values(perms).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl w-full max-w-lg mx-4 border border-slate-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-semibold text-slate-800 text-base font-[Sora]">
            {isEditing ? 'Editar rol' : 'Nuevo rol'}
          </h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="p-6 space-y-4 overflow-y-auto">
            {/* Nombre */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Nombre del rol</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Supervisor de Área"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
            </div>

            {/* Descripción */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Descripción <span className="text-slate-400 font-normal">(opcional)</span></label>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Describe brevemente el propósito de este rol..."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 resize-none"
              />
            </div>

            {/* Permissions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-600">
                  Módulos visibles
                  <span className="ml-2 text-xs font-normal text-slate-400">({selectedCount} de {MODULES.length} seleccionados)</span>
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={handleSelectAll} className="text-xs text-emerald-600 hover:text-emerald-700 cursor-pointer whitespace-nowrap">
                    Seleccionar todos
                  </button>
                  <span className="text-slate-300">·</span>
                  <button type="button" onClick={handleClearAll} className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer whitespace-nowrap">
                    Limpiar
                  </button>
                </div>
              </div>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                {MODULES.map((mod, idx) => (
                  <div
                    key={mod.key}
                    onClick={() => togglePerm(mod.key)}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none transition-colors hover:bg-slate-50 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                  >
                    <div className={`w-9 h-5 rounded-full transition-colors flex items-center shrink-0 ${perms[mod.key] ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-0.5 ${perms[mod.key] ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                    <div className="w-4 h-4 flex items-center justify-center text-slate-400 shrink-0">
                      <i className={`${mod.icon} text-sm`} />
                    </div>
                    <span className="text-sm text-slate-700">{mod.label}</span>
                    {perms[mod.key] && (
                      <span className="ml-auto text-xs text-emerald-600 font-medium">Visible</span>
                    )}
                  </div>
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
          </div>

          {/* Actions */}
          <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
            <button type="button" onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="flex-1 py-2 text-sm bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap font-medium flex items-center justify-center gap-2">
              {loading ? <i className="ri-loader-4-line animate-spin text-sm" /> : null}
              {isEditing ? 'Guardar cambios' : 'Crear rol'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
