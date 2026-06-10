import { useState, Fragment } from 'react';
import type { Area, TipoArea, Zona } from '../../../types/areas';
import { TIPO_COLORS, formatMoneda } from '../../../types/areas';
import AreaModal from './AreaModal';
import type { FormulaContext } from '@/lib/formulaEngine';
import { calcularFormula } from '@/lib/formulaEngine';
import FormulaBuilder from '@/pages/costos/components/FormulaBuilder';
import type { FormulaConfig } from '@/types/costos';

interface AreasTabProps {
  areas: Area[];
  tipos: TipoArea[];
  zonas: Zona[];
  formulaCtx: FormulaContext;
  onAdd: (area: Omit<Area, 'id' | 'created_at'>) => Promise<void>;
  onEdit: (id: string, area: Omit<Area, 'id' | 'created_at'>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function calcularCosto(area: Area, tipos: TipoArea[], formulaCtx?: FormulaContext): number | null {
  // Si tiene fórmula personalizada, calcularla
  if (area.costo_area_formula && formulaCtx) {
    return calcularFormula(area.costo_area_formula, formulaCtx, area.nombre);
  }
  // Fallback: costo por tipo de área × m²
  const tipo = tipos.find((t) => t.id === area.tipo_area_id);
  if (!tipo || tipo.costo_por_m2 <= 0 || area.metros_cuadrados <= 0) return null;
  return tipo.costo_por_m2 * area.metros_cuadrados;
}

export default function AreasTab({ areas, tipos, zonas, formulaCtx, onAdd, onEdit, onDelete }: AreasTabProps) {
  const [showModal, setShowModal] = useState(false);
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [defaultParent, setDefaultParent] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('all');
  const [filterActivo, setFilterActivo] = useState('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Modal para editar fórmula de costo del área
  const [formulaModalArea, setFormulaModalArea] = useState<Area | null>(null);
  const [savingFormula, setSavingFormula] = useState(false);

  const topLevel = areas.filter((a) => a.parent_id === null);
  const getHijos = (parentId: string) => areas.filter((a) => a.parent_id === parentId);
  const getTipo = (tipoId: string | null) => tipos.find((t) => t.id === tipoId);
  const getZona = (zonaId: string | null) => zonas.find((z) => z.id === zonaId);

  const matchesFilter = (a: Area): boolean => {
    const matchSearch =
      a.nombre.toLowerCase().includes(search.toLowerCase()) ||
      a.descripcion.toLowerCase().includes(search.toLowerCase());
    const matchTipo = filterTipo === 'all' || a.tipo_area_id === filterTipo;
    const matchActivo =
      filterActivo === 'all' ||
      (filterActivo === 'activo' && a.activo) ||
      (filterActivo === 'inactivo' && !a.activo);
    return matchSearch && matchTipo && matchActivo;
  };

  const filteredTop = topLevel.filter((a) => {
    return matchesFilter(a) || getHijos(a.id).some(matchesFilter);
  });

  const totalM2 = areas.reduce((s, a) => s + (a.metros_cuadrados ?? 0), 0);
  const totalM3 = areas.reduce((s, a) => s + (a.metros_cubicos ?? 0), 0);
  const totalCosto = areas.reduce((s, a) => {
    const c = calcularCosto(a, tipos, formulaCtx);
    return s + (c ?? 0);
  }, 0);

  const handleSave = async (data: Omit<Area, 'id' | 'created_at'>) => {
    setSaving(true);
    if (editingArea) {
      await onEdit(editingArea.id, data);
    } else {
      await onAdd(data);
    }
    setSaving(false);
    setShowModal(false);
    setEditingArea(null);
    setDefaultParent(null);
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    await onDelete(id);
    setSaving(false);
    setDeleteConfirm(null);
  };

  const openNew = (parentId: string | null = null) => {
    setEditingArea(null);
    setDefaultParent(parentId);
    setShowModal(true);
  };

  // Guardar fórmula de costo del área
  const handleSaveAreaFormula = async (formula: FormulaConfig) => {
    if (!formulaModalArea) return;
    setSavingFormula(true);
    // Calcular el costo con la fórmula para persistirlo también
    const computedCosto = calcularFormula(formula, formulaCtx, formulaModalArea.nombre);
    await onEdit(formulaModalArea.id, {
      nombre: formulaModalArea.nombre,
      tipo_area_id: formulaModalArea.tipo_area_id,
      parent_id: formulaModalArea.parent_id,
      zona_id: formulaModalArea.zona_id,
      categoria: formulaModalArea.categoria,
      metros_cuadrados: formulaModalArea.metros_cuadrados,
      moneda: formulaModalArea.moneda,
      descripcion: formulaModalArea.descripcion,
      activo: formulaModalArea.activo,
      tiene_automatizacion: formulaModalArea.tiene_automatizacion,
      metros_automatizacion: formulaModalArea.metros_automatizacion,
      cantidad_racks: formulaModalArea.cantidad_racks,
      metros_cubicos: formulaModalArea.metros_cubicos,
      costo_area: computedCosto > 0 ? computedCosto : formulaModalArea.costo_area,
      costo_area_formula: formula,
    });
    setSavingFormula(false);
    setFormulaModalArea(null);
  };

  const renderRow = (area: Area, isChild = false) => {
    const tipo = getTipo(area.tipo_area_id);
    const zona = getZona(area.zona_id ?? null);
    const costo = calcularCosto(area, tipos, formulaCtx);
    const monedaTipo = tipo?.moneda ?? 'USD';
    const hasFormula = !!area.costo_area_formula;

    return (
      <tr key={area.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${isChild ? 'bg-slate-50/30' : ''}`}>
        <td className="px-5 py-3.5">
          <div className={`flex items-center gap-2 ${isChild ? 'pl-7' : ''}`}>
            <div className="w-5 h-5 flex items-center justify-center shrink-0">
              <i className={`text-sm ${isChild ? 'ri-corner-down-right-line text-slate-300' : 'ri-folder-line text-slate-400'}`} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className={`text-sm font-medium ${isChild ? 'text-slate-700' : 'text-slate-800 font-semibold'}`}>{area.nombre}</p>
                {area.tiene_automatizacion && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 text-xs font-medium">
                    <i className="ri-robot-line text-xs" />
                    Auto
                  </span>
                )}
                {hasFormula && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-600 text-xs font-medium">
                    <i className="ri-function-line text-xs" />
                    Fórmula
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {zona && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                    <i className="ri-map-pin-line text-xs" />
                    {zona.nombre}
                  </span>
                )}
                {area.descripcion && (
                  <p className="text-xs text-slate-400 line-clamp-1">{area.descripcion}</p>
                )}
              </div>
            </div>
          </div>
        </td>
        <td className="px-5 py-3.5">
          <div className="flex flex-col gap-1.5">
            {tipo ? (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium w-fit ${TIPO_COLORS[tipo.color] ?? 'bg-slate-100 text-slate-600'}`}>
                <i className={`${tipo.icono} text-xs`} />
                {tipo.nombre}
              </span>
            ) : (
              <span className="text-xs text-slate-400">Sin tipo</span>
            )}
            {area.categoria && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium w-fit ${area.categoria === 'Interior' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                <i className={`text-xs ${area.categoria === 'Interior' ? 'ri-home-3-line' : 'ri-sun-line'}`} />
                {area.categoria}
              </span>
            )}
          </div>
        </td>
        <td className="px-5 py-3.5 text-right">
          {area.metros_cuadrados > 0 ? (
            <span className="text-sm font-semibold text-slate-700">
              {area.metros_cuadrados.toLocaleString()} m²
            </span>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>
        <td className="px-5 py-3.5 text-right">
          {area.metros_cubicos != null && area.metros_cubicos > 0 ? (
            <span className="text-sm font-semibold text-slate-700">
              {Number(area.metros_cubicos).toLocaleString()} m³
            </span>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>
        <td className="px-5 py-3.5 text-right">
          {costo !== null ? (
            <div>
              <span className="text-sm font-semibold text-emerald-700">{formatMoneda(costo, monedaTipo)}</span>
              <span className="ml-1 text-xs text-slate-400">{monedaTipo}</span>
              {hasFormula && (
                <span className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-teal-50 text-teal-600 text-[10px] font-medium">
                  <i className="ri-function-line" />
                  Fórmula
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>
        <td className="px-5 py-3.5 text-center">
          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${area.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {area.activo ? 'Activa' : 'Inactiva'}
          </span>
        </td>
        <td className="px-5 py-3.5">
          <div className="flex items-center justify-center gap-1">
            {!isChild && (
              <button
                onClick={() => openNew(area.id)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-emerald-50 cursor-pointer"
                title="Agregar sub-área"
              >
                <i className="ri-add-circle-line text-emerald-500 text-sm" />
              </button>
            )}
            <button
              onClick={() => setFormulaModalArea(area)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-teal-50 cursor-pointer"
              title="Fórmula de costo"
            >
              <i className={`ri-function-line text-sm ${hasFormula ? 'text-teal-600' : 'text-slate-400'}`} />
            </button>
            <button
              onClick={() => { setEditingArea(area); setShowModal(true); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer"
              title="Editar"
            >
              <i className="ri-pencil-line text-slate-500 text-sm" />
            </button>
            <button
              onClick={() => setDeleteConfirm(area.id)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-rose-50 cursor-pointer"
              title="Eliminar"
            >
              <i className="ri-delete-bin-line text-rose-400 text-sm" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Total de Áreas', value: `${areas.length}`, icon: 'ri-map-pin-2-line', color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Total m²', value: `${totalM2.toLocaleString()} m²`, icon: 'ri-ruler-2-line', color: 'text-amber-600 bg-amber-50' },
          { label: 'Total m³', value: `${totalM3.toLocaleString()} m³`, icon: 'ri-box-3-line', color: 'text-sky-600 bg-sky-50' },
          { label: 'Costo Total Calculado', value: totalCosto > 0 ? formatMoneda(totalCosto, 'USD') : '$0.00', icon: 'ri-calculator-line', color: 'text-slate-600 bg-slate-100' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
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
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar áreas..."
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 w-52"
            />
          </div>
          <select
            value={filterTipo}
            onChange={(e) => setFilterTipo(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
          >
            <option value="all">Todos los tipos</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
          <select
            value={filterActivo}
            onChange={(e) => setFilterActivo(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
          >
            <option value="all">Todos</option>
            <option value="activo">Activas</option>
            <option value="inactivo">Inactivas</option>
          </select>
        </div>
        <button
          onClick={() => openNew(null)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap"
        >
          <div className="w-4 h-4 flex items-center justify-center"><i className="ri-add-line" /></div>
          Nueva Área
        </button>
      </div>

      {/* Tree Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Área</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Metros²</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Metros³</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Costo del Área</th>
              <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
              <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredTop.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-400 text-sm">No se encontraron áreas</td>
              </tr>
            ) : (
              filteredTop.map((area) => {
                const hijos = getHijos(area.id).filter(matchesFilter);
                return (
                  <Fragment key={area.id}>
                    {renderRow(area, false)}
                    {hijos.map((hijo) => renderRow(hijo, true))}
                  </Fragment>
                );
              })
            )}
          </tbody>
          {areas.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td colSpan={2} className="px-5 py-3 text-xs font-semibold text-slate-500">
                  {areas.length} área{areas.length !== 1 ? 's' : ''}
                </td>
                <td className="px-5 py-3 text-right text-xs font-bold text-slate-700">
                  {totalM2.toLocaleString()} m²
                </td>
                <td className="px-5 py-3 text-right text-xs font-bold text-slate-700">
                  {areas.reduce((s, a) => s + (a.metros_cubicos ?? 0), 0).toLocaleString()} m³
                </td>
                <td className="px-5 py-3 text-right text-xs font-bold text-emerald-700">
                  {totalCosto > 0 ? formatMoneda(totalCosto, 'USD') : '—'}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Area edit/create modal */}
      {showModal && (
        <AreaModal
          area={editingArea}
          tipos={tipos}
          zonas={zonas}
          areas={areas}
          defaultParentId={defaultParent}
          formulaCtx={formulaCtx}
          onClose={() => { setShowModal(false); setEditingArea(null); setDefaultParent(null); }}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <div className="w-12 h-12 flex items-center justify-center rounded-full bg-rose-100 mx-auto mb-4">
              <i className="ri-delete-bin-line text-rose-500 text-2xl" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 text-center mb-2">¿Eliminar área?</h3>
            <p className="text-sm text-slate-500 text-center mb-5">
              Se eliminarán también las sub-áreas. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap">
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={saving}
                className="flex-1 py-2 rounded-lg bg-rose-500 text-white text-sm font-medium hover:bg-rose-600 cursor-pointer whitespace-nowrap transition-colors disabled:opacity-60"
              >
                {saving ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Formula modal for area cost */}
      {formulaModalArea && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-800">
                  Fórmula de costo del área
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">{formulaModalArea.nombre}</p>
              </div>
              <button onClick={() => setFormulaModalArea(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer">
                <i className="ri-close-line text-slate-500" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-600">
                  <i className="ri-information-line mr-1 text-slate-400" />
                  Definí una fórmula para calcular el costo de esta área. Podés usar todas las variables del sistema (inversiones, gastos varios, mano de obra, volúmenes, distribución de áreas, etc.).
                  Si no definís fórmula, se usa el costo por m² del tipo de área.
                </p>
              </div>
              <FormulaBuilder
                config={formulaModalArea.costo_area_formula ?? { terminos: [], mode: 'expression', expression: '' }}
                onChange={(config) => {
                  // preview only — actual save on click
                  if (!formulaModalArea) return;
                  setFormulaModalArea({ ...formulaModalArea, costo_area_formula: config });
                }}
                ctx={formulaCtx}
              />
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between shrink-0">
              <div>
                {formulaModalArea.costo_area_formula && (
                  <p className="text-xs text-slate-500">
                    Vista previa:{' '}
                    <span className="font-semibold text-emerald-700">
                      {formatMoneda(calcularFormula(formulaModalArea.costo_area_formula, formulaCtx, formulaModalArea.nombre), 'USD')}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setFormulaModalArea(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (!formulaModalArea?.costo_area_formula) {
                      // Clear formula: save null
                      handleSaveAreaFormula({ terminos: [], mode: 'expression', expression: '' });
                    } else {
                      handleSaveAreaFormula(formulaModalArea.costo_area_formula);
                    }
                  }}
                  disabled={savingFormula}
                  className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 cursor-pointer whitespace-nowrap transition-colors disabled:opacity-60"
                >
                  {savingFormula ? 'Guardando...' : 'Guardar Fórmula'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
