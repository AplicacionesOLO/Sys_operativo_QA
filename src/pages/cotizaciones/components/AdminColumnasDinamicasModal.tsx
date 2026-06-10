import { useState } from 'react';
import type {
  CotizacionColumnaDinamica,
  ColDisplayFormat,
  ColEffectType,
  ColAppliesTo,
} from '@/types/cotizaciones_v2';
import { DISPLAY_FORMAT_LABELS, EFFECT_TYPE_LABELS } from '@/types/cotizaciones_v2';
import {
  getAvailableVariables,
  findColumnsUsingVar,
  syncKeyRenameInFormulas,
  detectCircularDependency,
} from '@/lib/cotizacionFormulaEngine';
import CotizacionFormulaBuilder from './CotizacionFormulaBuilder';

interface Props {
  columnas: CotizacionColumnaDinamica[];
  onClose: () => void;
  onAdd: (data: Omit<CotizacionColumnaDinamica, 'id' | 'created_at'>) => Promise<void>;
  onUpdate: (id: string, data: Partial<CotizacionColumnaDinamica>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Fórmula del total ítem (para detectar uso de variables) */
  totalFormula?: string;
  /** Callback para actualizar fórmulas cuando cambia una key */
  onSyncKeyRename?: (updates: Map<string, string>, totalFormulaUpdated?: string) => Promise<void>;
  /** Valores reales de la primera fila para preview en el constructor de fórmulas */
  previewRowValues?: Record<string, number>;
}

interface FormState {
  name: string;
  key: string;
  display_format: ColDisplayFormat;
  effect_type: ColEffectType;
  applies_to: ColAppliesTo;
  formula_expression: string;
  is_editable: boolean;
  is_visible: boolean;
  is_active: boolean;
  sort_order: number;
}

const EMPTY_FORM: FormState = {
  name: '',
  key: '',
  display_format: 'currency',
  effect_type: 'display_only',
  applies_to: 'all',
  formula_expression: '',
  is_editable: true,
  is_visible: true,
  is_active: true,
  sort_order: 0,
};

const EFFECT_ICONS: Record<ColEffectType, string> = {
  add:          'ri-add-circle-line',
  subtract:     'ri-indeterminate-circle-line',
  multiply:     'ri-close-circle-line',
  display_only: 'ri-eye-line',
  formula:      'ri-function-line',
};

const EFFECT_COLORS: Record<ColEffectType, string> = {
  add:          'text-emerald-600 bg-emerald-50 border-emerald-200',
  subtract:     'text-rose-600 bg-rose-50 border-rose-200',
  multiply:     'text-orange-600 bg-orange-50 border-orange-200',
  display_only: 'text-slate-500 bg-slate-50 border-slate-200',
  formula:      'text-violet-600 bg-violet-50 border-violet-200',
};

export default function AdminColumnasDinamicasModal({ columnas, onClose, onAdd, onUpdate, onDelete, totalFormula, onSyncKeyRename, previewRowValues }: Props) {
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'list' | 'form'>('list');
  const [formulaError, setFormulaError] = useState<string | null>(null);

  const isFormula = form.effect_type === 'formula';

  const availableVars = getAvailableVariables(
    columnas,
    editingId
      ? (columnas.find(c => c.id === editingId)?.sort_order ?? form.sort_order)
      : form.sort_order,
    editingId ? (columnas.find(c => c.id === editingId)?.key) : undefined,
  );

  const handleEdit = (col: CotizacionColumnaDinamica) => {
    setForm({
      name: col.name,
      key: col.key,
      display_format: col.display_format ?? (col.data_type === 'currency' ? 'currency' : col.data_type === 'percent' ? 'percent' : 'number'),
      effect_type: col.effect_type,
      applies_to: col.applies_to,
      formula_expression: col.formula_expression ?? '',
      is_editable: col.is_editable,
      is_visible: col.is_visible,
      is_active: col.is_active,
      sort_order: col.sort_order,
    });
    setEditingId(col.id);
    setTab('form');
  };

  const handleNew = () => {
    setForm({ ...EMPTY_FORM, sort_order: columnas.length });
    setEditingId(null);
    setTab('form');
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.key.trim()) return;
    setFormulaError(null);

    const newKey = form.key.trim().toLowerCase().replace(/\s+/g, '_');

    // Validar dependencia circular si es fórmula
    if (isFormula && form.formula_expression.trim() && editingId) {
      const hasCycle = detectCircularDependency(columnas, editingId, form.formula_expression.trim());
      if (hasCycle) {
        setFormulaError('La fórmula genera una dependencia circular. Revisá las variables usadas.');
        return;
      }
    }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      key: newKey,
      data_type: form.display_format as any,
      display_format: form.display_format,
      input_type: 'input' as const,
      effect_type: form.effect_type,
      applies_to: form.applies_to,
      formula_expression: isFormula && form.formula_expression.trim() ? form.formula_expression.trim() : null,
      is_editable: form.effect_type !== 'formula' ? form.is_editable : false,
      is_visible: form.is_visible,
      is_active: form.is_active,
      sort_order: form.sort_order,
    };

    if (editingId) {
      const editingCol = columnas.find(c => c.id === editingId);
      const oldKey = editingCol?.key ?? '';

      // Si cambió la key, sincronizar en todas las fórmulas
      if (oldKey && oldKey !== newKey && onSyncKeyRename) {
        const formulaUpdates = syncKeyRenameInFormulas(columnas, oldKey, newKey);
        // También actualizar la fórmula del total si la usa
        let updatedTotalFormula: string | undefined;
        if (totalFormula) {
          const { replaceVarInExpression } = await import('@/lib/cotizacionFormulaEngine');
          const updated = replaceVarInExpression(totalFormula, oldKey, newKey);
          if (updated !== totalFormula) updatedTotalFormula = updated;
        }
        await onSyncKeyRename(formulaUpdates, updatedTotalFormula);
      }

      await onUpdate(editingId, payload);
    } else {
      await onAdd(payload);
    }
    setSaving(false);
    setTab('list');
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormulaError(null);
  };

  const handleDelete = async (id: string) => {
    const col = columnas.find(c => c.id === id);
    if (!col) return;

    // Detectar si la columna está siendo usada en otras fórmulas
    const usedIn = findColumnsUsingVar(columnas.filter(c => c.id !== id), col.key);
    const usedInTotal = totalFormula ? totalFormula.includes(col.key) : false;

    if (usedIn.length > 0 || usedInTotal) {
      const usedNames = usedIn.map(c => `"${c.name}"`).join(', ');
      const totalMsg = usedInTotal ? ' y en la fórmula del Total ítem' : '';
      const confirmed = confirm(
        `La columna "${col.name}" (${col.key}) está siendo usada en las fórmulas de: ${usedNames}${totalMsg}.\n\n` +
        `Si la eliminás, esas fórmulas quedarán con variables inválidas.\n\n¿Querés eliminarla de todas formas?`
      );
      if (!confirmed) return;
    } else {
      if (!confirm(`¿Eliminar la columna "${col.name}"? Se perderán todos sus valores.`)) return;
    }

    await onDelete(id);
  };

  const autoKey = (name: string) =>
    name.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl flex flex-col" style={{ maxHeight: '92vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-800">Columnas dinámicas</h2>
            <p className="text-xs text-slate-400 mt-0.5">Configura columnas adicionales con fórmulas y formatos</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <i className="ri-close-line" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-6 flex-shrink-0">
          <button
            onClick={() => setTab('list')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'list' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <i className="ri-list-check mr-1.5" />
            Columnas ({columnas.length})
          </button>
          <button
            onClick={handleNew}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'form' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <i className="ri-add-line mr-1.5" />
            {editingId ? 'Editar columna' : 'Nueva columna'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── LIST TAB ── */}
          {tab === 'list' && (
            <div className="p-6">
              {columnas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <div className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-100">
                    <i className="ri-table-line text-xl text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500">Sin columnas dinámicas</p>
                  <p className="text-xs text-slate-400">Crea columnas para agregar cálculos adicionales</p>
                  <button
                    onClick={handleNew}
                    className="mt-2 flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-add-line" />
                    Crear primera columna
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {columnas.sort((a, b) => a.sort_order - b.sort_order).map(col => {
                    const fmt = col.display_format ?? (col.data_type === 'currency' ? 'currency' : col.data_type === 'percent' ? 'percent' : 'number');
                    return (
                      <div
                        key={col.id}
                        className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                          col.is_active ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'
                        }`}
                      >
                        {/* Effect icon */}
                        <div className={`w-9 h-9 flex items-center justify-center rounded-lg border flex-shrink-0 ${EFFECT_COLORS[col.effect_type]}`}>
                          <i className={`${EFFECT_ICONS[col.effect_type]} text-sm`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-700">{col.name}</span>
                            <span className="text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{col.key}</span>
                            {!col.is_active && (
                              <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Inactiva</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-slate-500">{DISPLAY_FORMAT_LABELS[fmt as ColDisplayFormat] ?? fmt}</span>
                            <span className="text-slate-300">·</span>
                            <span className="text-xs text-slate-500">{EFFECT_TYPE_LABELS[col.effect_type]}</span>
                            {col.formula_expression && (
                              <>
                                <span className="text-slate-300">·</span>
                                <code className="text-xs text-violet-600 font-mono bg-violet-50 px-1.5 py-0.5 rounded max-w-[200px] truncate">
                                  {col.formula_expression}
                                </code>
                              </>
                            )}
                            <span className="text-slate-300">·</span>
                            <span className="text-xs text-slate-400">Orden: {col.sort_order}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => onUpdate(col.id, { is_active: !col.is_active })}
                            className={`w-7 h-7 flex items-center justify-center rounded transition-colors cursor-pointer ${
                              col.is_active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'
                            }`}
                            title={col.is_active ? 'Desactivar' : 'Activar'}
                          >
                            <i className={col.is_active ? 'ri-toggle-fill text-sm' : 'ri-toggle-line text-sm'} />
                          </button>
                          <button
                            onClick={() => handleEdit(col)}
                            className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                            title="Editar"
                          >
                            <i className="ri-pencil-line text-xs" />
                          </button>
                          <button
                            onClick={() => handleDelete(col.id)}
                            className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Eliminar"
                          >
                            <i className="ri-delete-bin-6-line text-xs" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── FORM TAB ── */}
          {tab === 'form' && (
            <div className="p-6 space-y-5">
              {/* Nombre + Key */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Nombre <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => {
                      const name = e.target.value;
                      setForm(f => ({
                        ...f,
                        name,
                        key: editingId ? f.key : autoKey(name),
                      }));
                    }}
                    placeholder="Ej: Seguro de carga"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 text-slate-700 placeholder-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Clave (key) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.key}
                    onChange={e => setForm(f => ({ ...f, key: e.target.value }))}
                    placeholder="seguro_carga"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 text-slate-700 placeholder-slate-300 font-mono"
                  />
                  <p className="text-xs text-slate-400 mt-1">Identificador único, sin espacios</p>
                </div>
              </div>

              {/* Formato visual + Efecto */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Formato visual</label>
                  <div className="flex gap-2">
                    {(Object.entries(DISPLAY_FORMAT_LABELS) as [ColDisplayFormat, string][]).map(([k, v]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, display_format: k }))}
                        className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                          form.display_format === k
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {k === 'number' && <i className="ri-hashtag mr-1" />}
                        {k === 'currency' && <i className="ri-money-dollar-circle-line mr-1" />}
                        {k === 'percent' && <i className="ri-percent-line mr-1" />}
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Efecto en el total</label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {(Object.entries(EFFECT_TYPE_LABELS) as [ColEffectType, string][]).map(([k, v]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, effect_type: k }))}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all cursor-pointer text-left ${
                          form.effect_type === k
                            ? `${EFFECT_COLORS[k]} border-current`
                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        <i className={`${EFFECT_ICONS[k]} text-sm`} />
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Aplica a + Orden */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Aplica a</label>
                  <select
                    value={form.applies_to}
                    onChange={e => setForm(f => ({ ...f, applies_to: e.target.value as ColAppliesTo }))}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 text-slate-700 cursor-pointer"
                  >
                    <option value="all">Todos los subprocesos</option>
                    <option value="process">Por proceso</option>
                    <option value="subprocess">Por subproceso</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Orden de cálculo</label>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                    min={0}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 text-slate-700"
                  />
                  <p className="text-xs text-slate-400 mt-1">Menor número = se calcula primero</p>
                </div>
              </div>

              {/* Formula builder — solo si effect_type === 'formula' */}
              {isFormula && (
                <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 flex items-center justify-center rounded bg-violet-100">
                      <i className="ri-function-line text-xs text-violet-600" />
                    </div>
                    <span className="text-xs font-bold text-violet-700">Constructor de fórmula</span>
                  </div>
                  <CotizacionFormulaBuilder
                    value={form.formula_expression}
                    onChange={expr => { setForm(f => ({ ...f, formula_expression: expr })); setFormulaError(null); }}
                    availableVars={availableVars}
                    currentColKey={editingId ? columnas.find(c => c.id === editingId)?.key : undefined}
                    previewValues={previewRowValues}
                  />
                  {formulaError && (
                    <div className="mt-3 flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5">
                      <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-error-warning-line text-rose-500 text-sm" />
                      </div>
                      <p className="text-xs text-rose-600">{formulaError}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Opciones */}
              <div className="flex items-center gap-6 pt-1">
                {[
                  { key: 'is_editable', label: 'Editable por usuario', disabled: isFormula },
                  { key: 'is_visible', label: 'Visible en tabla', disabled: false },
                  { key: 'is_active', label: 'Activa', disabled: false },
                ].map(({ key, label, disabled }) => (
                  <label key={key} className={`flex items-center gap-2 ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={disabled ? false : form[key as keyof FormState] as boolean}
                      onChange={e => !disabled && setForm(f => ({ ...f, [key]: e.target.checked }))}
                      disabled={disabled}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400 cursor-pointer"
                    />
                    <span className="text-xs text-slate-600">{label}</span>
                    {disabled && <span className="text-xs text-slate-400">(auto)</span>}
                  </label>
                ))}
              </div>

              {/* Acciones */}
              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setTab('list'); setEditingId(null); }}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.name.trim() || !form.key.trim()}
                  className="flex-1 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear columna'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
