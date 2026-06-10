import { useState } from 'react';
import type { TipoArea, Area } from '../../../types/areas';
import { TIPO_COLORS, formatMoneda } from '../../../types/areas';
import TipoAreaModal from './TipoAreaModal';

interface TiposAreaTabProps {
  tipos: TipoArea[];
  areas: Area[];
  onAdd: (tipo: Omit<TipoArea, 'id' | 'created_at'>) => Promise<void>;
  onEdit: (id: string, tipo: Omit<TipoArea, 'id' | 'created_at'>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function TiposAreaTab({ tipos, areas, onAdd, onEdit, onDelete }: TiposAreaTabProps) {
  const [showModal, setShowModal] = useState(false);
  const [editingTipo, setEditingTipo] = useState<TipoArea | null>(null);
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = tipos.filter(
    (t) =>
      t.nombre.toLowerCase().includes(search.toLowerCase()) ||
      t.descripcion.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSave = async (data: Omit<TipoArea, 'id' | 'created_at'>) => {
    setSaving(true);
    if (editingTipo) {
      await onEdit(editingTipo.id, data);
    } else {
      await onAdd(data);
    }
    setSaving(false);
    setShowModal(false);
    setEditingTipo(null);
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    if (areas.some((a) => a.tipo_area_id === confirmDelete)) return;
    setSaving(true);
    await onDelete(confirmDelete);
    setSaving(false);
    setConfirmDelete(null);
  };

  const hasAreas = (id: string) => areas.some((a) => a.tipo_area_id === id);
  const getAreaCount = (id: string) => areas.filter((a) => a.tipo_area_id === id).length;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div className="relative">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tipos de área..."
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 w-64"
          />
        </div>
        <button
          onClick={() => { setEditingTipo(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap"
        >
          <div className="w-4 h-4 flex items-center justify-center"><i className="ri-add-line" /></div>
          Nuevo Tipo de Área
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="w-12 h-12 flex items-center justify-center mx-auto mb-3">
            <i className="ri-inbox-line text-4xl" />
          </div>
          <p className="text-sm">No se encontraron tipos de área</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((tipo) => {
            const count = getAreaCount(tipo.id);
            const colorClass = TIPO_COLORS[tipo.color] ?? 'bg-slate-100 text-slate-600';
            return (
              <div key={tipo.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:border-emerald-300 transition-all">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${colorClass}`}>
                      <i className={`${tipo.icono} text-lg`} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800 leading-tight">{tipo.nombre}</h3>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
                        {count} área{count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditingTipo(tipo); setShowModal(true); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer"
                      title="Editar"
                    >
                      <i className="ri-pencil-line text-slate-500 text-sm" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(tipo.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-rose-50 cursor-pointer"
                      title="Eliminar"
                    >
                      <i className="ri-delete-bin-line text-rose-400 text-sm" />
                    </button>
                  </div>
                </div>

                {/* Costo por m² */}
                <div className="bg-slate-50 rounded-lg px-3 py-2.5 mb-3">
                  <p className="text-xs text-slate-400 mb-0.5">Costo por m²</p>
                  <p className="text-sm font-bold text-slate-700">
                    {tipo.costo_por_m2 > 0
                      ? formatMoneda(tipo.costo_por_m2, tipo.moneda ?? 'USD')
                      : <span className="text-slate-400 font-normal">Sin definir</span>}
                    {tipo.costo_por_m2 > 0 && (
                      <span className="ml-1.5 text-xs font-normal text-slate-400">/ m²</span>
                    )}
                  </p>
                </div>

                {tipo.descripcion && (
                  <p className="text-xs text-slate-500 leading-relaxed">{tipo.descripcion}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <TipoAreaModal
          tipo={editingTipo}
          onClose={() => { setShowModal(false); setEditingTipo(null); }}
          onSave={handleSave}
          saving={saving}
        />
      )}

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
                  Este tipo tiene áreas asignadas. Reasígnalas primero.
                </p>
                <button onClick={() => setConfirmDelete(null)} className="w-full py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium cursor-pointer whitespace-nowrap">
                  Entendido
                </button>
              </>
            ) : (
              <>
                <div className="w-12 h-12 flex items-center justify-center rounded-full bg-rose-100 mx-auto mb-4">
                  <i className="ri-delete-bin-line text-rose-500 text-2xl" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 text-center mb-2">¿Eliminar tipo de área?</h3>
                <p className="text-sm text-slate-500 text-center mb-5">Esta acción no se puede deshacer.</p>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 cursor-pointer whitespace-nowrap">
                    Cancelar
                  </button>
                  <button onClick={handleDeleteConfirm} disabled={saving} className="flex-1 py-2 rounded-lg bg-rose-500 text-white text-sm font-medium cursor-pointer whitespace-nowrap disabled:opacity-60">
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
