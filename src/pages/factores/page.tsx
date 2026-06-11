import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import AppLayout from '@/components/feature/AppLayout';
import type { Factor } from '@/types/factores';
import { cascadeRenameTokens, factorRenamePairs } from '@/lib/formulaTokenRename';

interface FactorModalState {
  open: boolean;
  editing: Factor | null;
}

export default function FactoresPage() {
  const [factores, setFactores] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<FactorModalState>({ open: false, editing: null });
  const [nombre, setNombre] = useState('');
  const [valor, setValor] = useState('1');
  const [descripcion, setDescripcion] = useState('');

  const loadFactores = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('factores')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setFactores((data ?? []) as Factor[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFactores();
  }, [loadFactores]);

  const openModal = (editing: Factor | null = null) => {
    setNombre(editing?.nombre ?? '');
    setValor(editing ? String(editing.valor) : '1');
    setDescripcion(editing?.descripcion ?? '');
    setModal({ open: true, editing });
  };

  const closeModal = () => {
    setModal({ open: false, editing: null });
    setNombre('');
    setValor('1');
    setDescripcion('');
  };

  const handleSave = async () => {
    const v = parseFloat(valor);
    if (!nombre.trim() || isNaN(v)) return;
    setSaving(true);
    const payload = { nombre: nombre.trim(), valor: v, descripcion: descripcion.trim() || null };
    if (modal.editing) {
      await supabase.from('factores').update(payload).eq('id', modal.editing.id);
      // Cascade-rename FACTOR_* tokens if nombre changed
      if (nombre.trim() !== modal.editing.nombre) {
        cascadeRenameTokens(factorRenamePairs(modal.editing.nombre, nombre.trim()));
      }
    } else {
      await supabase.from('factores').insert(payload);
    }
    setSaving(false);
    closeModal();
    await loadFactores();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este factor?')) return;
    await supabase.from('factores').delete().eq('id', id);
    setFactores(prev => prev.filter(f => f.id !== id));
  };

  return (
    <AppLayout
      title="Factores"
      subtitle="Constantes y multiplicadores reutilizables para fórmulas de costos"
      actions={
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
        >
          <div className="w-4 h-4 flex items-center justify-center"><i className="ri-add-line" /></div>
          Nuevo Factor
        </button>
      }
    >
      <div className="max-w-4xl space-y-5">
        {/* Info banner */}
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl">
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
            <i className="ri-lightbulb-line text-amber-500" />
          </div>
          <div>
            <p className="text-xs text-amber-700 font-medium">Cómo usar los factores</p>
            <p className="text-xs text-amber-600 mt-1 leading-relaxed">
              Cada factor que crees aquí se convierte automáticamente en una variable disponible en
              <strong> Costos por Operación → Fórmulas</strong>. Podés multiplicar cualquier valor por estos factores
              para ajustar costos sin cambiar la fórmula original.
            </p>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : factores.length === 0 ? (
          <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <div className="w-12 h-12 flex items-center justify-center rounded-full bg-white border border-slate-200 mx-auto mb-3">
              <i className="ri-equalizer-line text-slate-400 text-xl" />
            </div>
            <p className="text-sm font-medium text-slate-500">Sin factores registrados</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Los factores son constantes reutilizables (por ejemplo: margen de beneficio, tasa de costo indirecto, etc.)
            </p>
            <button
              onClick={() => openModal()}
              className="mt-4 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              Crear primer factor
            </button>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Token (variable)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Valor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Descripción</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {factores.map(factor => {
                  const token = factor.nombre.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
                  return (
                    <tr key={factor.id} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 flex items-center justify-center rounded bg-amber-100 text-amber-600">
                            <i className="ri-equalizer-line text-xs" />
                          </div>
                          <span className="font-medium text-slate-700">{factor.nombre}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs font-mono text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-100">
                          {`{FACTOR_${token}}`}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-slate-700 tabular-nums">
                          {factor.valor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-slate-500 truncate max-w-xs">{factor.descripcion || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openModal(factor)}
                            className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                            title="Editar"
                          >
                            <i className="ri-pencil-line text-sm" />
                          </button>
                          <button
                            onClick={() => handleDelete(factor.id)}
                            className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Eliminar"
                          >
                            <i className="ri-delete-bin-6-line text-sm" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800">
                {modal.editing ? 'Editar Factor' : 'Nuevo Factor'}
              </h3>
              <button onClick={closeModal} className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer">
                <i className="ri-close-line" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre del factor</label>
                <input
                  type="text"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  placeholder="Ej: Margen de beneficio, Tasa indirecta..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                />
                {nombre.trim() && (
                  <p className="text-xs text-slate-400 mt-1.5 font-mono">
                    Token disponible: <span className="text-amber-600">{`{FACTOR_${nombre.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}}`}</span>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Valor</label>
                <input
                  type="number"
                  step="any"
                  value={valor}
                  onChange={e => setValor(e.target.value)}
                  placeholder="1.0"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                />
                <p className="text-xs text-slate-400 mt-1.5">Este valor se usará tal cual en las fórmulas. Ej: 1.25, 0.15, 1000.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Descripción</label>
                <textarea
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                  rows={2}
                  placeholder="Breve descripción del propósito de este factor..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 resize-none"
                  maxLength={200}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
              <button
                onClick={closeModal}
                className="flex-1 py-2.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !nombre.trim() || isNaN(parseFloat(valor))}
                className="flex-1 py-2.5 text-sm font-medium bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors cursor-pointer"
              >
                {saving ? 'Guardando...' : modal.editing ? 'Guardar cambios' : 'Crear factor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}