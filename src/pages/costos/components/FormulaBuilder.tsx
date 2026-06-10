import { useState, useRef, useMemo } from 'react';
import type { FormulaConfig, FormulaTermino } from '@/types/costos';
import type { FormulaContext } from '@/lib/formulaEngine';
import type { InversionRecord } from '@/types/inversion';
import { esFinanciamiento, calcularInversion } from '@/types/inversion';
import { getFormulaDescription, getDistribucionFactor } from '@/lib/formulaEngine';
import { buildVariableDefs, buildVariableMap } from '@/lib/formulaVariables';
import type { AllDataSources } from '@/lib/formulaVariables';
import VariablePicker from './VariablePicker';
import FormulaEditor from './FormulaEditor';
import type { FormulaEditorHandle } from './FormulaEditor';

interface FormulaBuilderProps {
  config: FormulaConfig;
  onChange: (config: FormulaConfig) => void;
  ctx: FormulaContext;
}

// ── Helpers for legacy terms mode ────────────────────────────────────────────
type SourceTipo = FormulaTermino['tipo'];

const SOURCE_TYPES: { tipo: SourceTipo; label: string; icon: string; desc: string; color: string }[] = [
  {
    tipo: 'inversion_depreciacion',
    label: 'Inversión — Depreciación mensual',
    icon: 'ri-arrow-down-line',
    desc: 'Depreciación mensual calculada de un activo',
    color: 'text-rose-600 bg-rose-50 border-rose-200',
  },
  {
    tipo: 'inversion_pago_mensual',
    label: 'Inversión — Pago mensual (PMT)',
    icon: 'ri-bank-card-line',
    desc: 'Cuota mensual de préstamo o alquiler',
    color: 'text-teal-600 bg-teal-50 border-teal-200',
  },
  {
    tipo: 'gastos_varios_columna',
    label: 'Gastos Varios — Total de columna',
    icon: 'ri-receipt-line',
    desc: 'Suma total de una columna de Gastos Varios',
    color: 'text-amber-600 bg-amber-50 border-amber-200',
  },
];

const TIPO_COLOR: Record<SourceTipo, string> = {
  inversion_depreciacion: 'bg-rose-100 text-rose-700',
  inversion_pago_mensual: 'bg-teal-100 text-teal-700',
  gastos_varios_columna:  'bg-amber-100 text-amber-700',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function getMonthlyVal(inv: InversionRecord, tipo: SourceTipo): number {
  const calc = calcularInversion(inv);
  if (tipo === 'inversion_pago_mensual') return calc.cuota_mensual;
  if (esFinanciamiento(inv.tipo)) return 0;
  const n = Math.max(inv.rango ?? 0, 0);
  const valor = Math.max(inv.valor_inicial ?? 0, 0);
  if (inv.metodo_depreciacion === 'tiempo') {
    const meses = inv.unidad_rango === 'años' ? n * 12 : n;
    return meses > 0 ? valor / meses : 0;
  }
  return valor * ((inv.tasa_depreciacion ?? 0) / 100) / 12;
}

function ctxToAllDataSources(ctx: FormulaContext): AllDataSources {
  return {
    inversiones: ctx.inversiones,
    gastosColumnas: ctx.gastosColumnas,
    gastosFilas: ctx.gastosFilas as AllDataSources['gastosFilas'],
    manoObraColumnas: ctx.manoObraColumnas ?? [],
    manoObraFilas: (ctx.manoObraFilas ?? []) as AllDataSources['manoObraFilas'],
    manoObraEmpleados: ctx.manoObraEmpleados ?? [],
    volumenesColumnas: ctx.volumenesColumnas ?? [],
    volumenesFilas: (ctx.volumenesFilas ?? []) as AllDataSources['volumenesFilas'],
    costosColumnas: ctx.costosColumnas ?? [],
    costosFilas: (ctx.costosFilas ?? []) as AllDataSources['costosFilas'],
    areaDistribucion: ctx.areaDistribucion as AllDataSources['areaDistribucion'],
    areasData: (ctx.areasData ?? []) as AllDataSources['areasData'],
    volDistribucion: (ctx.volDistribucion ?? []) as AllDataSources['volDistribucion'],
    factores: (ctx.factores ?? []) as AllDataSources['factores'],
    masivoArticulos: (ctx.masivoArticulos ?? []) as AllDataSources['masivoArticulos'],
    masivoZonas: (ctx.masivoZonas ?? []) as AllDataSources['masivoZonas'],
    masivoTotals: ctx.masivoTotals,
  };
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FormulaBuilder({ config, onChange, ctx }: FormulaBuilderProps) {
  const mode = config.mode ?? 'terms';
  const editorRef = useRef<FormulaEditorHandle>(null);

  // Build variable defs + map for expression mode
  const allData = useMemo(() => ctxToAllDataSources(ctx), [ctx]);
  const defs = useMemo(() => buildVariableDefs(allData), [allData]);
  const varMap = useMemo(() => buildVariableMap(defs, allData), [defs, allData]);

  // Switch mode
  const switchMode = (newMode: 'terms' | 'expression') => {
    if (newMode === mode) return;
    onChange({ ...config, mode: newMode });
  };

  // ── Expression mode handlers ─────────────────────────────────────────────
  const handleInsertToken = (token: string) => {
    editorRef.current?.insertAtCursor(token);
  };

  // ── Terms mode state ─────────────────────────────────────────────────────
  const [step, setStep] = useState<'idle' | 'tipo' | 'item' | 'cfg'>('idle');
  const [draftTipo, setDraftTipo] = useState<SourceTipo | null>(null);
  const [draftItem, setDraftItem] = useState<{ id: string; nombre: string } | null>(null);
  const [draftFactor, setDraftFactor] = useState('1');
  const [draftDistrib, setDraftDistrib] = useState(false);
  const [draftAreaFuente, setDraftAreaFuente] = useState<string>('subproceso_fila');
  const [draftFiltrarArea, setDraftFiltrarArea] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const resetDraft = () => {
    setStep('idle');
    setDraftTipo(null);
    setDraftItem(null);
    setDraftFactor('1');
    setDraftDistrib(false);
    setDraftAreaFuente('subproceso_fila');
    setDraftFiltrarArea(false);
    setEditingId(null);
  };

  const getItemsForTipo = (tipo: SourceTipo) => {
    if (tipo === 'inversion_depreciacion') {
      return ctx.inversiones.filter(i => !esFinanciamiento(i.tipo)).map(i => ({ id: i.id, nombre: i.nombre || 'Sin nombre' }));
    }
    if (tipo === 'inversion_pago_mensual') {
      return ctx.inversiones.filter(i => esFinanciamiento(i.tipo)).map(i => ({ id: i.id, nombre: i.nombre || 'Sin nombre' }));
    }
    return ctx.gastosColumnas.filter(c => ['moneda', 'numero', 'porcentaje'].includes(c.tipo)).map(c => ({ id: c.id, nombre: c.nombre }));
  };

  const addTerm = () => {
    if (!draftTipo || !draftItem) return;
    const factor = parseFloat(draftFactor) || 1;
    const newTerm: FormulaTermino = {
      id: editingId ?? crypto.randomUUID(),
      tipo: draftTipo,
      referenciaId: draftItem.id,
      referenciaNombre: draftItem.nombre,
      factor,
      aplicarDistribucion: draftDistrib,
      areaFuente: draftAreaFuente,
      filtrarPorArea: draftFiltrarArea,
    };
    const terminos = config.terminos ?? [];
    if (editingId) {
      onChange({ ...config, terminos: terminos.map(t => t.id === editingId ? newTerm : t) });
    } else {
      onChange({ ...config, terminos: [...terminos, newTerm] });
    }
    resetDraft();
  };

  const startEdit = (t: FormulaTermino) => {
    setEditingId(t.id);
    setDraftTipo(t.tipo);
    setDraftItem({ id: t.referenciaId, nombre: t.referenciaNombre });
    setDraftFactor(String(t.factor));
    setDraftDistrib(t.aplicarDistribucion);
    setDraftAreaFuente(t.areaFuente);
    setDraftFiltrarArea(t.filtrarPorArea ?? false);
    setStep('cfg');
  };

  const removeTerm = (id: string) => {
    onChange({ ...config, terminos: (config.terminos ?? []).filter(t => t.id !== id) });
  };

  const terminos = config.terminos ?? [];

  // ── Render mode toggle ────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
        <button
          onClick={() => switchMode('terms')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
            mode === 'terms'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <div className="w-3 h-3 flex items-center justify-center">
            <i className="ri-stack-line" />
          </div>
          Constructor visual
        </button>
        <button
          onClick={() => switchMode('expression')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
            mode === 'expression'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <div className="w-3 h-3 flex items-center justify-center">
            <i className="ri-code-s-slash-line" />
          </div>
          Expresión personalizada
        </button>
      </div>

      {/* ── EXPRESSION MODE ────────────────────────────────────────────── */}
      {mode === 'expression' && (
        <div className="grid grid-cols-5 gap-3 min-h-[380px]">
          {/* Variable picker (left) */}
          <div className="col-span-2 border border-slate-200 rounded-xl bg-white overflow-hidden flex flex-col">
            <div className="px-3 py-2.5 border-b border-slate-100 flex-shrink-0">
              <p className="text-xs font-semibold text-slate-600">
                <i className="ri-database-2-line mr-1 text-emerald-500" />
                Variables disponibles
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Clic para insertar en la fórmula</p>
            </div>
            <div className="flex-1 min-h-0">
              <VariablePicker
                defs={defs}
                varMap={varMap}
                onInsert={handleInsertToken}
              />
            </div>
          </div>

          {/* Formula editor (right) */}
          <div className="col-span-3 flex flex-col gap-2">
            <FormulaEditor
              ref={editorRef}
              expression={config.expression ?? ''}
              onChange={expr => onChange({ ...config, expression: expr })}
              varMap={varMap}
              defs={defs}
            />
          </div>
        </div>
      )}

      {/* ── TERMS MODE (legacy visual builder) ────────────────────────── */}
      {mode === 'terms' && (
        <div>
          {/* Current terms */}
          {terminos.length > 0 ? (
            <div className="space-y-2 mb-3">
              <div className="px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs font-medium text-slate-500 mb-0.5">
                  <i className="ri-functions mr-1 text-emerald-600" />
                  Vista previa de fórmula
                </p>
                <p className="text-xs text-slate-700 font-mono leading-relaxed">
                  {getFormulaDescription({ terminos, mode: 'terms' })}
                </p>
              </div>
              {terminos.map((t, idx) => (
                <div key={t.id} className="flex items-start gap-3 px-3 py-3 bg-white border border-slate-200 rounded-lg group/term">
                  <span className="text-xs text-slate-400 mt-0.5 w-4 flex-shrink-0 text-center font-mono">
                    {idx === 0 ? '=' : '+'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TIPO_COLOR[t.tipo]}`}>
                        {SOURCE_TYPES.find(s => s.tipo === t.tipo)?.label.split('—')[1]?.trim() ?? t.tipo}
                      </span>
                      <span className="text-xs font-semibold text-slate-700 truncate">{t.referenciaNombre}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {t.factor !== 1 && <span className="text-xs text-slate-500">× {t.factor}</span>}
                      {t.aplicarDistribucion && (
                        <span className="text-xs text-emerald-600">
                          <i className="ri-pie-chart-line mr-0.5" />
                          Dist. {t.areaFuente === 'subproceso_fila' ? 'por área de fila' : t.areaFuente}
                        </span>
                      )}
                      {t.filtrarPorArea && (
                        <span className="text-xs text-amber-600">
                          <i className="ri-filter-line mr-0.5" />Filtrado por área
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover/term:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => startEdit(t)} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 cursor-pointer transition-colors">
                      <i className="ri-pencil-line text-xs" />
                    </button>
                    <button onClick={() => removeTerm(t.id)} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 cursor-pointer transition-colors">
                      <i className="ri-delete-bin-6-line text-xs" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : step === 'idle' && (
            <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 mb-3">
              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-slate-200 mx-auto mb-2">
                <i className="ri-functions text-slate-400 text-lg" />
              </div>
              <p className="text-xs font-medium text-slate-500">Sin términos en la fórmula</p>
              <p className="text-xs text-slate-400 mt-0.5">Agrega fuentes de datos para calcular el valor</p>
            </div>
          )}

          {/* Add button */}
          {step === 'idle' && (
            <button
              onClick={() => setStep('tipo')}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-emerald-300 text-emerald-600 hover:bg-emerald-50 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <div className="w-4 h-4 flex items-center justify-center"><i className="ri-add-line" /></div>
              Agregar fuente de datos
            </button>
          )}

          {/* Step forms */}
          {step === 'tipo' && (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-600 mb-3">Selecciona la fuente de datos</p>
              {SOURCE_TYPES.map(st => {
                const items = getItemsForTipo(st.tipo);
                const isEmpty = items.length === 0;
                return (
                  <button
                    key={st.tipo}
                    disabled={isEmpty}
                    onClick={() => { setDraftTipo(st.tipo); setStep('item'); }}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all cursor-pointer ${isEmpty ? 'opacity-40 cursor-not-allowed border-slate-200 bg-white' : `${st.color} hover:opacity-90`}`}
                  >
                    <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/70 flex-shrink-0 mt-0.5">
                      <i className={`${st.icon} text-sm`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">{st.label}</p>
                      <p className="text-xs opacity-70 mt-0.5">{st.desc}</p>
                      {isEmpty && <p className="text-xs mt-0.5 opacity-60 italic">Sin datos disponibles</p>}
                    </div>
                  </button>
                );
              })}
              <button onClick={resetDraft} className="w-full text-xs text-slate-400 hover:text-slate-600 py-2 cursor-pointer">Cancelar</button>
            </div>
          )}

          {step === 'item' && draftTipo && (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-600">{SOURCE_TYPES.find(s => s.tipo === draftTipo)?.label}</p>
                <button onClick={() => setStep('tipo')} className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"><i className="ri-arrow-left-line mr-1" />Volver</button>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {getItemsForTipo(draftTipo).map(item => {
                  const isInv = draftTipo !== 'gastos_varios_columna';
                  const inv = isInv ? ctx.inversiones.find(i => i.id === item.id) : null;
                  const val = inv ? getMonthlyVal(inv, draftTipo) : null;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setDraftItem({ id: item.id, nombre: item.nombre }); setStep('cfg'); }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left transition-all cursor-pointer ${draftItem?.id === item.id ? 'border-emerald-400 bg-white' : 'border-slate-200 bg-white hover:border-emerald-300'}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                        <span className="text-xs font-medium text-slate-700 truncate">{item.nombre}</span>
                      </div>
                      {val !== null && <span className="text-xs text-slate-400 flex-shrink-0 tabular-nums">{fmt(val)}/mes</span>}
                    </button>
                  );
                })}
              </div>
              <button onClick={resetDraft} className="w-full text-xs text-slate-400 hover:text-slate-600 py-2 mt-2 cursor-pointer">Cancelar</button>
            </div>
          )}

          {step === 'cfg' && draftTipo && draftItem && (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-600">Configurar término</p>
                {!editingId && <button onClick={() => setStep('item')} className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"><i className="ri-arrow-left-line mr-1" />Volver</button>}
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TIPO_COLOR[draftTipo]}`}>
                  {SOURCE_TYPES.find(s => s.tipo === draftTipo)?.label.split('—')[0].trim()}
                </span>
                <span className="text-xs text-slate-700 font-medium truncate">{draftItem.nombre}</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Factor multiplicador <span className="text-slate-400 font-normal">(1 = 100%, 0.5 = 50%)</span>
                </label>
                <input type="number" step="0.01" min="0" value={draftFactor} onChange={e => setDraftFactor(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 bg-white" />
              </div>
              {draftTipo === 'gastos_varios_columna' && (
                <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200">
                  <input id="filtrar-area" type="checkbox" checked={draftFiltrarArea} onChange={e => setDraftFiltrarArea(e.target.checked)} className="mt-0.5 accent-emerald-500 cursor-pointer" />
                  <label htmlFor="filtrar-area" className="cursor-pointer">
                    <p className="text-xs font-medium text-slate-700">Filtrar por área del subproceso</p>
                    <p className="text-xs text-slate-400 mt-0.5">Solo suma gastos cuya área coincida con el área de cada fila</p>
                  </label>
                </div>
              )}
              {ctx.areaDistribucion.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200">
                    <input id="distrib-toggle" type="checkbox" checked={draftDistrib} onChange={e => setDraftDistrib(e.target.checked)} className="mt-0.5 accent-emerald-500 cursor-pointer" />
                    <label htmlFor="distrib-toggle" className="cursor-pointer">
                      <p className="text-xs font-medium text-slate-700">Aplicar % de distribución por área</p>
                      <p className="text-xs text-slate-400 mt-0.5">Multiplica el valor por el porcentaje de distribución global del área</p>
                    </label>
                  </div>
                  {draftDistrib && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Fuente del área</label>
                      <select value={draftAreaFuente} onChange={e => setDraftAreaFuente(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 bg-white">
                        <option value="subproceso_fila">Usar área del subproceso de cada fila</option>
                        {ctx.areaDistribucion.map(a => (
                          <option key={a.area_name} value={a.area_name}>{a.area_name} ({a.global_distribution_percentage?.toFixed(2)}%)</option>
                        ))}
                      </select>
                      {draftAreaFuente !== 'subproceso_fila' && (
                        <p className="text-xs text-slate-400 mt-1">Factor: {(getDistribucionFactor(draftAreaFuente, ctx) * 100).toFixed(2)}%</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No hay datos de distribución disponibles</p>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={resetDraft} className="flex-1 py-2 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap">Cancelar</button>
                <button onClick={addTerm} className="flex-1 py-2 text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors">
                  {editingId ? 'Guardar cambios' : 'Agregar término'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
