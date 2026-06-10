import type { Cotizacion } from '@/types/cotizaciones';
import type { CostoFila, CostoColumna } from '@/types/costos';
import type { CotizacionItem } from '@/types/cotizaciones';
import type { FormulaContext } from '@/lib/formulaEngine';
import { calcularFormula, EMPTY_FORMULA_CTX } from '@/lib/formulaEngine';

import type { FormulaConfig } from '@/types/costos';

function getRowTotal(
  fila: CostoFila,
  columnas: CostoColumna[],
  ctx: FormulaContext,
  formulasOverride?: Record<string, FormulaConfig>,
): number {
  return columnas.reduce((sum, col) => {
    if (col.tipo === 'texto' || col.tipo === 'select') return sum;
    if (col.tipo === 'formula') {
      const f = formulasOverride?.[col.id] ?? fila.formulas?.[col.id] ?? col.formula;
      if (!f) return sum;
      const mode = f.mode ?? 'terms';
      const has = (mode === 'expression' && !!f.expression?.trim()) ||
        (mode === 'terms' && (f.terminos?.length ?? 0) > 0);
      return has ? sum + calcularFormula(f, ctx, fila.subproceso) : sum;
    }
    const v = Number(fila.valores[col.id] ?? 0);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);

const PROCESO_COLORS: Record<string, string> = {
  'Inbound': '#10b981', 'Outbound': '#0ea5e9', 'Almacenaje': '#f59e0b',
  'No Nacionalizados': '#f43f5e', 'Cross Docking': '#8b5cf6',
  'Devoluciones': '#f97316', 'Administración': '#14b8a6',
};
function getColor(p: string) { return PROCESO_COLORS[p] ?? '#64748b'; }

interface CotizacionTableItemRow {
  item: CotizacionItem;
  fila: CostoFila;
}

interface Props {
  cotizacion: Cotizacion;
  items: CotizacionTableItemRow[];
  columnas: CostoColumna[];
  formulaCtx?: FormulaContext;
  onClose: () => void;
}

export default function CotizacionPDFPreview({ cotizacion, items, columnas, formulaCtx, onClose }: Props) {
  const ctx = formulaCtx ?? EMPTY_FORMULA_CTX;

  // Columnas de fórmula visibles — null o vacío = ninguna (solo base/mult/total en PDF)
  const visibleColIds = cotizacion.columnas_visibles && cotizacion.columnas_visibles.length > 0
    ? new Set(cotizacion.columnas_visibles)
    : new Set<string>();
  const visibleFormulaCols = columnas.filter(c =>
    c.tipo === 'formula' && visibleColIds.has(c.id)
  );

  // Determinar orientación: landscape si hay 3+ columnas visibles
  const hasExtraCols = visibleFormulaCols.length >= 3;
  const isLandscape = hasExtraCols;

  // Anchos en mm según orientación
  const pageW = isLandscape ? '297mm' : '210mm';
  const pageH = isLandscape ? '210mm' : '297mm';
  const pagePadding = isLandscape ? '12mm 16mm' : '16mm 20mm';

  const grupos = new Map<string, CotizacionTableItemRow[]>();
  items.forEach(item => {
    const k = item.fila.proceso;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(item);
  });

  const grandTotal = items.reduce((sum, { item, fila }) => {
    return sum + getRowTotal(fila, columnas, ctx, item.formulas_override ?? {}) * item.multiplicador * cotizacion.sim_multiplier;
  }, 0);

  const procesoTotals = Array.from(grupos.entries()).map(([proceso, gItems]) => ({
    proceso,
    total: gItems.reduce((s, { item, fila }) =>
      s + getRowTotal(fila, columnas, ctx, item.formulas_override ?? {}) * item.multiplicador * cotizacion.sim_multiplier, 0),
  }));

  const now = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });

  const handlePrint = () => {
    window.print();
  };

  // Tamaños adaptativos según número de columnas
  // Columnas fijas: Subproceso + formulaCols + Costo base + Multiplicador (único) + Total = formulaCols.length + 4
  const colCount = 4 + visibleFormulaCols.length;
  const fs = colCount > 7 ? 9 : colCount > 5 ? 10 : 11;
  const thPad = colCount > 7 ? '7px 8px' : colCount > 5 ? '8px 10px' : '10px 14px';
  const tdPad = colCount > 7 ? '6px 8px' : colCount > 5 ? '7px 10px' : '9px 14px';
  const fixedColW = colCount > 7 ? 80 : colCount > 5 ? 95 : 110;
  const multColW = colCount > 7 ? 60 : colCount > 5 ? 70 : 85;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex flex-col">
      {/* Toolbar — hidden when printing */}
      <div className="print:hidden bg-slate-900 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <i className="ri-arrow-left-line" />
          </button>
          <div>
            <p className="text-white font-semibold text-sm">{cotizacion.nombre}</p>
            <p className="text-slate-400 text-xs">
              Vista previa PDF — {cotizacion.cliente}
              {isLandscape && <span className="ml-2 text-amber-400 text-xs">(formato horizontal)</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isLandscape && (
            <span className="text-xs text-amber-300 bg-amber-900/40 px-3 py-1.5 rounded-lg whitespace-nowrap">
              <i className="ri-landscape-line mr-1" />
              Paisaje A4 — {visibleFormulaCols.length} columnas extra
            </span>
          )}
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <div className="w-4 h-4 flex items-center justify-center">
              <i className="ri-printer-line" />
            </div>
            Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      {/* PDF content */}
      <div className="flex-1 overflow-auto bg-slate-200 py-8 px-4 print:p-0 print:bg-white print:overflow-visible">
        <div
          id="cotizacion-pdf"
          className="bg-white mx-auto print:w-full print:shadow-none"
          style={{
            width: pageW,
            padding: pagePadding,
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: fs,
            color: '#1e293b',
            boxShadow: '0 4px 32px rgba(0,0,0,0.12)',
          }}
        >
          {/* Header */}
          <div style={{ borderBottom: '3px solid #10b981', paddingBottom: 12, marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className="ri-bar-chart-box-line" style={{ color: 'white', fontSize: 14 }} />
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>CostOp</span>
                </div>
                <p style={{ fontSize: 10, color: '#64748b', margin: 0 }}>Sistema de Costos de Operación</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', margin: '0 0 3px 0' }}>COTIZACIÓN</p>
                <p style={{ fontSize: 10, color: '#64748b', margin: '0 0 2px 0' }}>Fecha: {now}</p>
                <div style={{
                  display: 'inline-block',
                  padding: '2px 9px',
                  borderRadius: 20,
                  backgroundColor: cotizacion.estado === 'aprobada' ? '#dcfce7' : cotizacion.estado === 'enviada' ? '#fef3c7' : '#f1f5f9',
                  color: cotizacion.estado === 'aprobada' ? '#166534' : cotizacion.estado === 'enviada' ? '#92400e' : '#475569',
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase' as const,
                  letterSpacing: 0.5,
                  marginTop: 3,
                }}>
                  {cotizacion.estado}
                </div>
              </div>
            </div>
          </div>

          {/* Client info */}
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 7, padding: '11px 16px', marginBottom: 18, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
              <div>
                <p style={{ fontSize: 8, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: 1, margin: '0 0 3px 0' }}>CLIENTE</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>{cotizacion.cliente}</p>
              </div>
              <div>
                <p style={{ fontSize: 8, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: 1, margin: '0 0 3px 0' }}>COTIZACIÓN</p>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', margin: 0 }}>{cotizacion.nombre}</p>
              </div>
              {cotizacion.descripcion && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <p style={{ fontSize: 8, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: 1, margin: '0 0 3px 0' }}>DESCRIPCIÓN</p>
                  <p style={{ fontSize: 10, color: '#475569', margin: 0, lineHeight: 1.5 }}>{cotizacion.descripcion}</p>
                </div>
              )}
            </div>
          </div>

          {/* Items table */}
          <div style={{ width: '100%' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              marginBottom: 20,
              fontSize: fs,
              tableLayout: 'auto',
            }}>
              <colgroup>
                {/* Proceso/subproceso: ocupa el resto */}
                <col />
                {/* Formula columns — ancho fijo */}
                {visibleFormulaCols.map(col => (
                  <col key={col.id} style={{ width: fixedColW }} />
                ))}
                {/* Costo base */}
                <col style={{ width: fixedColW }} />
                {/* Multiplicador (único — incluye global) */}
                <col style={{ width: multColW }} />
                {/* Total */}
                <col style={{ width: fixedColW + 15 }} />
              </colgroup>
              <thead>
                <tr style={{ backgroundColor: '#1e293b' }}>
                  <th style={{ padding: thPad, textAlign: 'left', color: '#e2e8f0', fontWeight: 700, fontSize: fs - 1, textTransform: 'uppercase' as const, letterSpacing: 0.6, verticalAlign: 'bottom' }}>
                    Proceso / Subproceso
                  </th>
                  {visibleFormulaCols.map(col => (
                    <th key={col.id} style={{ padding: thPad, textAlign: 'right', color: '#c4b5fd', fontWeight: 700, fontSize: fs - 1, textTransform: 'uppercase' as const, letterSpacing: 0.5, backgroundColor: 'rgb(46,16,101)', verticalAlign: 'bottom', lineHeight: 1.3 }}>
                      {col.nombre}
                    </th>
                  ))}
                  <th style={{ padding: thPad, textAlign: 'right', color: '#e2e8f0', fontWeight: 700, fontSize: fs - 1, textTransform: 'uppercase' as const, letterSpacing: 0.6, verticalAlign: 'bottom', whiteSpace: 'nowrap' }}>
                    Costo base
                  </th>
                  <th style={{ padding: thPad, textAlign: 'center', color: '#fcd34d', fontWeight: 700, fontSize: fs - 1, textTransform: 'uppercase' as const, letterSpacing: 0.6, verticalAlign: 'bottom', whiteSpace: 'nowrap' }}>
                    {cotizacion.sim_multiplier !== 1 ? 'Mult. efectivo' : 'Mult.'}
                  </th>
                  <th style={{ padding: thPad, textAlign: 'right', color: '#6ee7b7', fontWeight: 700, fontSize: fs - 1, textTransform: 'uppercase' as const, letterSpacing: 0.6, backgroundColor: 'rgb(7,47,40)', verticalAlign: 'bottom', whiteSpace: 'nowrap' }}>
                    Total ítem
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from(grupos.entries()).map(([proceso, gItems]) => {
                  // Columnas: Subproceso + formulaCols + Costo base + Multiplicador + Total = formulaCols.length + 4
                  const colSpanCount = 4 + visibleFormulaCols.length;
                  return (
                    <>
                      {/* Process header */}
                      <tr key={`head-${proceso}`}>
                        <td colSpan={colSpanCount}
                          style={{
                            padding: `6px ${tdPad.split(' ')[1] ?? '14px'}`,
                            backgroundColor: '#f8fafc',
                            borderLeft: `3px solid ${getColor(proceso)}`,
                            borderBottom: '1px solid #e2e8f0',
                            fontSize: fs - 1,
                            fontWeight: 700,
                            color: '#475569',
                            textTransform: 'uppercase' as const,
                            letterSpacing: 0.6,
                          }}
                        >
                          {proceso}
                        </td>
                      </tr>
                      {/* Items */}
                      {gItems.map(({ item, fila }, idx) => {
                        const override = item.formulas_override ?? {};
                        const baseTotal = getRowTotal(fila, columnas, ctx, override);
                        const itemTotal = baseTotal * item.multiplicador * cotizacion.sim_multiplier;
                        const isEven = idx % 2 === 0;
                        return (
                          <tr key={item.id} style={{ backgroundColor: isEven ? '#ffffff' : '#fafafa' }}>
                            <td style={{
                              padding: tdPad,
                              borderLeft: `2px solid ${getColor(proceso)}`,
                              borderBottom: '1px solid #f1f5f9',
                            }}>
                              <span style={{ fontSize: fs, fontWeight: 600, color: '#334155' }}>
                                {fila.subproceso || '—'}
                              </span>
                              {item.notas_item && (
                                <p style={{ fontSize: fs - 2, color: '#94a3b8', margin: '2px 0 0 0', fontStyle: 'italic' }}>{item.notas_item}</p>
                              )}
                            </td>
                            {/* Formula column values */}
                            {visibleFormulaCols.map(col => {
                              const f = override[col.id] ?? fila.formulas?.[col.id] ?? col.formula;
                              const mode = f?.mode ?? 'terms';
                              const hasF = f && ((mode === 'expression' && !!f.expression?.trim()) || (mode === 'terms' && (f.terminos?.length ?? 0) > 0));
                              const val = hasF ? calcularFormula(f!, ctx, fila.subproceso) : 0;
                              return (
                                <td key={col.id} style={{ padding: tdPad, textAlign: 'right', borderBottom: '1px solid #f1f5f9', color: '#5b21b6', fontWeight: 600, backgroundColor: 'rgb(245,243,255)', fontSize: fs }}>
                                  {hasF ? fmt(val) : <span style={{ color: '#cbd5e1' }}>—</span>}
                                </td>
                              );
                            })}
                            <td style={{ padding: tdPad, textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontWeight: 500, color: '#64748b', fontSize: fs }}>
                              {fmt(baseTotal)}
                            </td>
                            {/* Multiplicador único: ítem × global fusionados */}
                            <td style={{ padding: tdPad, textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                              {cotizacion.sim_multiplier !== 1 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                  <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 20, backgroundColor: '#fff7ed', color: '#c2410c', fontSize: fs, fontWeight: 800 }}>
                                    ×{+(item.multiplicador * cotizacion.sim_multiplier).toFixed(4)}
                                  </span>
                                  <span style={{ fontSize: fs - 2, color: '#9ca3af' }}>
                                    ({item.multiplicador}×{cotizacion.sim_multiplier})
                                  </span>
                                </div>
                              ) : (
                                <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 20, backgroundColor: '#fff7ed', color: '#c2410c', fontSize: fs - 1, fontWeight: 700 }}>
                                  ×{item.multiplicador}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: tdPad, textAlign: 'right', borderBottom: '1px solid #f1f5f9', backgroundColor: 'rgb(240,253,250)' }}>
                              <span style={{ fontWeight: 800, color: '#0f766e', fontSize: fs + 1 }}>{fmt(itemTotal)}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary box */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
            <div style={{ width: isLandscape ? '40%' : '55%', minWidth: 220 }}>
              {/* Subtotals by process */}
              {procesoTotals.map(({ proceso, total }) => (
                <div key={proceso} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 12px', borderBottom: '1px solid #f1f5f9', gap: 8 }}>
                  <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', backgroundColor: getColor(proceso), flexShrink: 0 }} />
                    {proceso}
                  </span>
                  <span style={{ fontSize: 10, color: '#334155', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(total)}</span>
                </div>
              ))}
              {/* Grand total */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', padding: '10px 12px',
                backgroundColor: '#064e3b', borderRadius: 7, marginTop: 7,
              }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#6ee7b7', textTransform: 'uppercase' as const, letterSpacing: 0.8 }}>TOTAL GENERAL</span>
                <span style={{ fontSize: 15, fontWeight: 900, color: '#6ee7b7' }}>{fmt(grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
            <p style={{ fontSize: 8, color: '#94a3b8', margin: 0 }}>{now}</p>
          </div>
        </div>
      </div>

      {/* Print styles — dynamic orientation */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: ${isLandscape ? 'A4 landscape' : 'A4 portrait'};
            margin: ${isLandscape ? '10mm 14mm' : '14mm 18mm'};
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          body * { visibility: hidden; }
          #cotizacion-pdf, #cotizacion-pdf * { visibility: visible; }
          #cotizacion-pdf {
            position: fixed;
            left: 0;
            top: 0;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            font-size: ${fs}px !important;
          }
          table {
            table-layout: auto !important;
            width: 100% !important;
          }
        }
      ` }} />
    </div>
  );
}
