import { useState } from 'react';
import type { Zona, Area } from '../../../types/areas';
import ZonaModal from './ZonaModal';

interface ZonasTabProps {
  zonas: Zona[];
  areas: Area[];
  onAdd: (zona: Omit<Zona, 'id' | 'created_at'>) => Promise<void>;
  onEdit: (id: string, zona: Omit<Zona, 'id' | 'created_at'>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function ZonasTab({ zonas, areas, onAdd, onEdit, onDelete }: ZonasTabProps) {
  const [showModal, setShowModal] = useState(false);
  const [editingZona, setEditingZona] = useState<Zona | null>(null);
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = zonas.filter((z) =>
    z.nombre.toLowerCase().includes(search.toLowerCase()),
  );

  const getAreaCount = (zonaId: string) =>
    areas.filter((a) => a.zona_id === zonaId).length;

  const hasAreas = (zonaId: string) =>
    areas.some((a) => a.zona_id === zonaId);

  const handleSave = async (data: Omit<Zona, 'id' | 'created_at'>) => {
    setSaving(true);
    if (editingZona) {
      await onEdit(editingZona.id, data);
    } else {
      await onAdd(data);
    }
    setSaving(false);
    setShowModal(false);
    setEditingZona(null);
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    await onDelete(confirmDelete);
    setSaving(false);
    setConfirmDelete(null);
  };

  const confirmingZona = zonas.find((z) => z.id === confirmDelete);

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        {[
          {
            label: 'Total de Zonas',
            value: zonas.length.toString(),
            icon: 'ri-map-pin-2-line',
            color: 'text-teal-600 bg-teal-50',
          },
          {
            label: 'Áreas con Zona Asignada',
            value: areas.filter((a) => a.zona_id !== null).length.toString(),
            icon: 'ri-folder-line',
            color: 'text-emerald-600 bg-emerald-50',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4"
          >
            <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${stat.color}`}>
              <i className={`${stat.icon} text-lg`} />
            </div>
            <div>
              <p className="text-xs text-slate-500">{stat.label}</p>
              <p className="text-base font-bold text-slate-800">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div className="relative">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar zonas..."
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400 w-60"
          />
        </div>
        <button
          onClick={() => { setEditingZona(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-teal-500 text-white text-sm font-medium rounded-lg hover:bg-teal-600 transition-colors cursor-pointer whitespace-nowrap"
        >
          <div className="w-4 h-4 flex items-center justify-center">
            <i className="ri-add-line" />
          </div>
          Nueva Zona
        </button>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="w-14 h-14 flex items-center justify-center mx-auto mb-3 rounded-full bg-slate-50">
            <i className="ri-map-pin-2-line text-3xl text-slate-300" />
          </div>
          <p className="text-sm font-medium text-slate-500 mb-1">
            {search ? 'Sin resultados' : 'Sin zonas registradas'}
          </p>
          <p className="text-xs text-slate-400">
            {search ? 'Intenta con otro término de búsqueda' : 'Crea la primera zona para empezar a clasificar tus áreas'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((zona) => {
            const count = getAreaCount(zona.id);
            return (
              <div
                key={zona.id}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:border-teal-300 transition-all group"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-teal-50 shrink-0">
                      <i className="ri-map-pin-2-line text-teal-500 text-lg" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800 leading-tight">{zona.nombre}</h3>
                      <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                        <i className="ri-folder-line text-xs" />
                        {count} área{count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditingZona(zona); setShowModal(true); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer"
                      title="Editar"
                    >
                      <i className="ri-pencil-line text-slate-500 text-sm" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(zona.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-rose-50 cursor-pointer"
                      title="Eliminar"
                    >
                      <i className="ri-delete-bin-line text-rose-400 text-sm" />
                    </button>
                  </div>
                </div>

                {/* Áreas asignadas */}
                <div className="border-t border-slate-100 pt-3 mt-3">
                  {count > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {areas
                        .filter((a) => a.zona_id === zona.id)
                        .slice(0, 4)
                        .map((a) => (
                          <span
                            key={a.id}
                            className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full"
                          >
                            {a.nombre}
                          </span>
                        ))}
                      {count > 4 && (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-400 text-xs rounded-full">
                          +{count - 4} más
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Sin áreas asignadas</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <ZonaModal
          zona={editingZona}
          onClose={() => { setShowModal(false); setEditingZona(null); }}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            {hasAreas(confirmDelete) ? (
              <>
                <div className="w-12 h-12 flex items-center justify-center rounded-full bg-amber-100 mx-auto mb-4">
                  <i className="ri-alert-line text-amber-500 text-2xl" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 text-center mb-2">No se puede eliminar</h3>
                <p className="text-sm text-slate-500 text-center mb-5">
                  La zona <strong>{confirmingZona?.nombre}</strong> tiene {getAreaCount(confirmDelete)} área{getAreaCount(confirmDelete) !== 1 ? 's' : ''} asignada{getAreaCount(confirmDelete) !== 1 ? 's' : ''}.
                  Reasígnalas antes de eliminar.
                </p>
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="w-full py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium cursor-pointer whitespace-nowrap"
                >
                  Entendido
                </button>
              </>
            ) : (
              <>
                <div className="w-12 h-12 flex items-center justify-center rounded-full bg-rose-100 mx-auto mb-4">
                  <i className="ri-delete-bin-line text-rose-500 text-2xl" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 text-center mb-2">¿Eliminar zona?</h3>
                <p className="text-sm text-slate-500 text-center mb-5">
                  Se eliminará <strong>{confirmingZona?.nombre}</strong>. Esta acción no se puede deshacer.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 cursor-pointer whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDeleteConfirm}
                    disabled={saving}
                    className="flex-1 py-2 rounded-lg bg-rose-500 text-white text-sm font-medium cursor-pointer whitespace-nowrap disabled:opacity-60"
                  >
                    {saving ? 'Eliminando...' : 'Eliminar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
