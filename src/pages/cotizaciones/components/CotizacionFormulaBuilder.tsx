import { useState, useRef, useCallback, useEffect } from 'react';
import { validateFormulaExpression, evalCotizacionFormula } from '@/lib/cotizacionFormulaEngine';
import type { VarDef } from '@/lib/cotizacionFormulaEngine';

interface Props {
  value: string;
  onChange: (expr: string) => void;
  availableVars: VarDef[];
  currentColKey?: string;
  /** Valores de ejemplo para preview */
  previewValues?: Record<string, number>;
}

const OPERATORS = ['+', '-', '*', '/', '(', ')'];

const DEFAULT_PREVIEW: Record<string, number> = {
  costo_base: 1000,
  multiplicador: 1.5,
  cantidad_unidades: 1.5,
  cantidad_lineas: 5,
  subtotal_item: 1500,
  total_item: 1500,
};

export default function CotizacionFormulaBuilder({
  value,
  onChange,
  availableVars,
  currentColKey,
  previewValues,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cursorPos, setCursorPos] = useState<number>(value.length);

  const allowedKeys = availableVars.map(v => v.key);

  const validation = validateFormulaExpression(value, allowedKeys, currentColKey);

  const preview = useCallback((): { ok: boolean; value?: number; error?: string } => {
    if (!value.trim()) return { ok: false };
    // Merge: DEFAULT_PREVIEW < previewValues (valores reales tienen prioridad)
    const vars: Record<string, number> = { ...DEFAULT_PREVIEW };
    // Si hay previewValues reales, usarlos para TODAS las variables disponibles
    if (previewValues && Object.keys(previewValues).length > 0) {
      availableVars.forEach(v => {
        vars[v.key] = previewValues[v.key] ?? DEFAULT_PREVIEW[v.key] ?? 1;
      });
    } else {
      // Sin datos reales: usar DEFAULT_PREVIEW para base, 1 para columnas dinámicas
      availableVars.forEach(v => {
        vars[v.key] = DEFAULT_PREVIEW[v.key] ?? 1;
      });
    }
    return evalCotizacionFormula(value, vars);
  }, [value, availableVars, previewValues]);

  const previewResult = preview();

  const insertAtCursor = useCallback((text: string) => {
    const el = inputRef.current;
    if (!el) {
      onChange(value + text);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const newVal = value.slice(0, start) + text + value.slice(end);
    onChange(newVal);
    const newPos = start + text.length;
    setCursorPos(newPos);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(newPos, newPos);
    }, 0);
  }, [value, onChange]);

  useEffect(() => {
    const el = inputRef.current;
    if (el) el.setSelectionRange(cursorPos, cursorPos);
  }, [cursorPos]);

  const fmtPreview = (n: number) =>
    new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  return (
    <div className="space-y-3">
      {/* Input de expresión */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <label className="text-xs font-semibold text-slate-600">Expresión de fórmula</label>
          {value.trim() && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              validation.valid
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-rose-100 text-rose-600'
            }`}>
              {validation.valid ? 'Válida' : 'Error'}
            </span>
          )}
        </div>
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={e => {
              onChange(e.target.value);
              setCursorPos(e.target.selectionStart ?? e.target.value.length);
            }}
            onClick={e => setCursorPos((e.target as HTMLInputElement).selectionStart ?? 0)}
            onKeyUp={e => setCursorPos((e.target as HTMLInputElement).selectionStart ?? 0)}
            placeholder="Ej: costo_base * 0.05"
            className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none font-mono text-slate-700 placeholder-slate-300 pr-8 ${
              value.trim() && !validation.valid
                ? 'border-rose-300 bg-rose-50/30 focus:border-rose-400'
                : 'border-slate-200 focus:border-emerald-400'
            }`}
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-slate-300 hover:text-slate-500 transition-colors cursor-pointer"
            >
              <i className="ri-close-line text-xs" />
            </button>
          )}
        </div>
        {value.trim() && !validation.valid && (
          <p className="mt-1 text-xs text-rose-500 flex items-center gap-1">
            <i className="ri-error-warning-line" />
            {validation.error}
          </p>
        )}
      </div>

      {/* Operadores rápidos */}
      <div>
        <p className="text-xs text-slate-400 mb-1.5 font-medium">Operadores</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {OPERATORS.map(op => (
            <button
              key={op}
              type="button"
              onClick={() => insertAtCursor(op)}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-sm font-bold text-slate-600 transition-colors cursor-pointer"
            >
              {op}
            </button>
          ))}
          <button
            type="button"
            onClick={() => insertAtCursor(' ')}
            className="px-3 h-9 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs text-slate-400 transition-colors cursor-pointer whitespace-nowrap"
          >
            espacio
          </button>
        </div>
      </div>

      {/* Variables disponibles */}
      <div>
        <p className="text-xs text-slate-400 mb-1.5 font-medium">Variables disponibles — clic para insertar</p>
        <div className="flex flex-wrap gap-1.5">
          {availableVars.map(v => {
            const isUsed = validation.usedVars.includes(v.key);
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => insertAtCursor(v.key)}
                title={v.description}
                className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono font-medium transition-all cursor-pointer whitespace-nowrap ${
                  isUsed
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                <i className={`ri-code-s-slash-line text-xs ${isUsed ? 'text-emerald-500' : 'text-slate-400'}`} />
                {v.key}
                <span className={`text-xs font-sans font-normal hidden group-hover:inline ${isUsed ? 'text-emerald-500' : 'text-slate-400'}`}>
                  — {v.label}
                </span>
              </button>
            );
          })}
        </div>
        {availableVars.length === 0 && (
          <p className="text-xs text-slate-400 italic">
            No hay variables disponibles. Las columnas dinámicas previas aparecerán aquí.
          </p>
        )}
      </div>

      {/* Preview del resultado */}
      {value.trim() && validation.valid && (
        <div className={`rounded-xl border p-3 ${
          previewResult.ok
            ? 'border-emerald-200 bg-emerald-50/60'
            : 'border-rose-200 bg-rose-50/60'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <i className={`text-sm ${previewResult.ok ? 'ri-calculator-line text-emerald-600' : 'ri-error-warning-line text-rose-500'}`} />
              <span className="text-xs font-semibold text-slate-600">Preview con valores de ejemplo</span>
            </div>
            {previewResult.ok && (
              <span className="text-sm font-bold text-emerald-700 font-mono tabular-nums">
                = {fmtPreview(previewResult.value!)}
              </span>
            )}
          </div>
          {previewResult.ok && (
            <div className="mt-2 flex flex-wrap gap-2">
              {availableVars.filter(v => validation.usedVars.includes(v.key)).map(v => {
                const val = previewValues?.[v.key] ?? DEFAULT_PREVIEW[v.key] ?? 1;
                const isReal = previewValues && v.key in previewValues;
                return (
                  <span key={v.key} className={`text-xs font-mono px-2 py-0.5 rounded border ${
                    isReal
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-white/80 border-slate-200 text-slate-500'
                  }`}>
                    {v.key} = {fmtPreview(val)}
                    {isReal && <span className="text-emerald-400 ml-1 font-sans text-xs">✓</span>}
                  </span>
                );
              })}
            </div>
          )}
          {previewResult.ok && previewValues && Object.keys(previewValues).length > 0 && (
            <p className="mt-1.5 text-xs text-emerald-600 flex items-center gap-1">
              <i className="ri-checkbox-circle-line" />
              Valores reales de la primera fila
            </p>
          )}
          {!previewResult.ok && previewResult.error && (
            <p className="mt-1 text-xs text-rose-500">{previewResult.error}</p>
          )}
        </div>
      )}

      {/* Ejemplos */}
      <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
        <p className="text-xs font-semibold text-slate-500 mb-2">Ejemplos de fórmulas</p>
        <div className="space-y-1">
          {[
            { expr: 'costo_base * 0.05', desc: '5% del costo base' },
            { expr: 'subtotal_item * 0.12', desc: '12% del subtotal' },
            { expr: '(costo_base + 500) * multiplicador', desc: 'Costo ajustado × multiplicador' },
            { expr: 'total_item * 0.03', desc: '3% del total acumulado' },
          ].map(ex => (
            <button
              key={ex.expr}
              type="button"
              onClick={() => onChange(ex.expr)}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-white hover:border-slate-200 border border-transparent transition-colors cursor-pointer text-left group"
            >
              <code className="text-xs text-slate-600 font-mono group-hover:text-emerald-700 transition-colors">{ex.expr}</code>
              <span className="text-xs text-slate-400 ml-2 whitespace-nowrap">{ex.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
