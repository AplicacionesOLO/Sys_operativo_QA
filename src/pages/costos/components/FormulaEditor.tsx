import { useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { validateExpression, evalFormula } from '@/lib/mathEvaluator';
import type { VariableDef } from '@/lib/formulaVariables';

export interface FormulaEditorHandle {
  insertAtCursor: (text: string) => void;
}

interface FormulaEditorProps {
  expression: string;
  onChange: (expr: string) => void;
  varMap: Record<string, number>;
  defs: VariableDef[];
}

const OPERATORS = ['+', '-', '*', '/', '(', ')'];

function fmt(n: number): string {
  return new Intl.NumberFormat('es-CR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

const FormulaEditor = forwardRef<FormulaEditorHandle, FormulaEditorProps>(
  function FormulaEditor({ expression, onChange, varMap, defs }, ref) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [focused, setFocused] = useState(false);

    // Insert text at cursor position
    const insertAtCursor = useCallback((text: string) => {
      const ta = textareaRef.current;
      if (!ta) {
        onChange(expression + text);
        return;
      }
      const start = ta.selectionStart ?? expression.length;
      const end = ta.selectionEnd ?? expression.length;
      const newExpr = expression.slice(0, start) + text + expression.slice(end);
      onChange(newExpr);
      // Restore cursor after inserted text
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(start + text.length, start + text.length);
      });
    }, [expression, onChange]);

    // Expose insertAtCursor to parent via ref
    useImperativeHandle(ref, () => ({ insertAtCursor }), [insertAtCursor]);

    // Validation
    const validationError = expression.trim() ? validateExpression(expression) : null;

    // Preview result
    const previewResult = !validationError && expression.trim()
      ? evalFormula(expression, varMap)
      : null;

    // Highlight tokens in a display div
    const renderHighlighted = () => {
      if (!expression) return null;
      const parts: JSX.Element[] = [];
      let i = 0;
      let key = 0;
      while (i < expression.length) {
        if (expression[i] === '{') {
          const end = expression.indexOf('}', i);
          if (end !== -1) {
            const token = expression.slice(i + 1, end);
            const def = defs.find(d => d.token === token);
            parts.push(
              <span
                key={key++}
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium mx-0.5 ${def ? def.tagColor : 'bg-slate-100 text-slate-600'}`}
              >
                {def ? def.label : token}
              </span>
            );
            i = end + 1;
            continue;
          }
        }
        let plain = '';
        while (i < expression.length && expression[i] !== '{') {
          plain += expression[i++];
        }
        if (plain) {
          parts.push(<span key={key++} className="text-slate-800 font-mono text-sm">{plain}</span>);
        }
      }
      return parts;
    };

    return (
      <div className="space-y-3">
        {/* Quick operator buttons */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-slate-400 mr-1">Operadores:</span>
          {OPERATORS.map(op => (
            <button
              key={op}
              onClick={() => insertAtCursor(op === '(' || op === ')' ? op : ` ${op} `)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-sm font-mono font-semibold text-slate-600 hover:bg-slate-100 hover:border-slate-300 cursor-pointer transition-colors"
              title={`Insertar ${op}`}
            >
              {op}
            </button>
          ))}
          <button
            onClick={() => insertAtCursor(' ')}
            className="px-2 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-xs text-slate-400 hover:bg-slate-100 cursor-pointer transition-colors whitespace-nowrap"
          >
            espacio
          </button>
        </div>

        {/* Formula textarea */}
        <div className={`relative rounded-lg border-2 transition-colors ${
          focused
            ? validationError && expression.trim()
              ? 'border-rose-400'
              : 'border-emerald-400'
            : validationError && expression.trim()
              ? 'border-rose-200'
              : 'border-slate-200'
        }`}>
          <textarea
            ref={textareaRef}
            value={expression}
            onChange={e => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={'Escribe o construye tu fórmula...\nej: ({TOTAL_MANO_OBRA} + {TOTAL_GASTOS_VARIOS}) / {TOTAL_VOLUMENES}'}
            rows={4}
            className="w-full px-4 py-3 font-mono text-sm text-slate-800 bg-white rounded-lg resize-none focus:outline-none placeholder-slate-300"
            spellCheck={false}
          />
          <div className="absolute bottom-2 right-3 text-xs text-slate-300">
            {expression.length} chars
          </div>
        </div>

        {/* Token preview (humanized view) */}
        {expression.trim() && (
          <div className="px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs text-slate-400 mb-1.5 font-medium">Vista legible:</p>
            <div className="flex flex-wrap items-center gap-0.5 min-h-[24px]">
              {renderHighlighted()}
            </div>
          </div>
        )}

        {/* Validation / result */}
        {expression.trim() && (
          <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs ${
            validationError
              ? 'bg-rose-50 border border-rose-200'
              : 'bg-emerald-50 border border-emerald-200'
          }`}>
            <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
              <i className={validationError ? 'ri-error-warning-line text-rose-500' : 'ri-checkbox-circle-line text-emerald-500'} />
            </div>
            {validationError ? (
              <p className="text-rose-700">{validationError}</p>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-emerald-700 font-medium">Fórmula válida</p>
                {previewResult?.ok && (
                  <span className="text-emerald-600 font-semibold tabular-nums">
                    Resultado estimado: {fmt(previewResult.value)}
                  </span>
                )}
                {previewResult?.unknowns?.length ? (
                  <span className="text-amber-600">
                    <i className="ri-alert-line mr-1" />
                    Variables no encontradas: {previewResult.unknowns.join(', ')}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* Tip */}
        <p className="text-xs text-slate-400">
          <i className="ri-lightbulb-line mr-1 text-amber-400" />
          Selecciona una variable del panel izquierdo para insertarla en la posición del cursor
        </p>
      </div>
    );
  }
);

export default FormulaEditor;
