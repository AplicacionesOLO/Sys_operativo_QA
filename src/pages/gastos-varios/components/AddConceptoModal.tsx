import { useState, useEffect } from 'react';
import type { GastoVarioFila, TipoFila } from '@/types/gastos_varios';
import { TIPO_FILA_OPTIONS } from '@/types/gastos_varios';

interface AddConceptoModalProps {
  filas: GastoVarioFila[];
  defaultParentId?: string | null;
  onClose: () => void;
  onSave: (data: {
    concepto: string;
    parent_id: string | null;
    tipo_fila: TipoFila;
    es_total: boolean;
  }) => void;
}

export default function AddConceptoModal({
  filas,
  defaultParentId,
  onClose,
  onSave,
}: AddConceptoModalProps) {
  const [concepto, setConcepto] = useState('');
  const [parentId, setParentId] = useState<string | null>(defaultParentId ?? null);
  const [tipoFila, setTipoFila] = useState<TipoFila>('detalle');
  const [esTotal, setEsTotal] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (defaultParentId !== undefined) setParentId(defaultParentId);
  }, [defaultParentId]);

  const candidateParents = filas.filter(f => f.tipo_fila !== 'detalle');

  const handleSave = () => {
    if (!concepto.trim()) { setError('El concepto es obligatorio'); return; }
    onSave({
      concepto: concepto.trim(),
      parent_id: parentId,
      tipo_fila: tipoFila,
      es_total: esTotal,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl w-full max-w-md mx-4 overflow-hidden border border-slate-200">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Agregar concepto</h2>
            <p className="text-xs text-slate-400 mt-0.5">Define el nombre y jerarquía del nuevo elemento</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Concepto */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Nombre del concepto <span className="text-rose-500">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={concepto}
              onChange={e => { setConcepto(e.target.value); setError(''); }}
              placeholder="ej. Colocación, Personal Administración..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
            />
            {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
          </div>

          {/* Tipo de fila */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Tipo de fila</label>
            <div className="flex flex-col gap-2">
              {TIPO_FILA_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setTipoFila(opt.value);
                    if (opt.value === 'total') setEsTotal(true);
                    else setEsTotal(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all cursor-pointer ${
                    tipoFila === opt.value
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                    opt.value === 'total' ? 'bg-slate-700' : opt.value === 'subtotal' ? 'bg-slate-400' : 'bg-slate-200'
                  }`} />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Padre */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Concepto padre <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <select
              value={parentId ?? ''}
              onChange={e => setParentId(e.target.value || null)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 cursor-pointer bg-white"
            >
              <option value="">— Nivel raíz (sin padre) —</option>
              {candidateParents.map(f => (
                <option key={f.id} value={f.id}>
                  {'  '.repeat(f.nivel)}{f.concepto}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            Agregar concepto
          </button>
        </div>
      </div>
    </div>
  );
}
