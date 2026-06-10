import { useState } from 'react';
import type { CotizacionCabecera } from '@/types/cotizaciones_v2';
import { MESES, MONEDAS } from '@/types/cotizaciones_v2';

interface Props {
  source: CotizacionCabecera;
  nextVersion: number;
  onClose: () => void;
  onConfirm: (opts: { mes: number; anio: number; version: number; moneda: string; notas: string }) => Promise<void>;
}

export default function DuplicarCotizacionModal({ source, nextVersion, onClose, onConfirm }: Props) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [version, setVersion] = useState(nextVersion);
  const [moneda, setMoneda] = useState(source.moneda);
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);

  const years = Array.from({ length: 8 }, (_, i) => now.getFullYear() - 2 + i);

  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm({ mes, anio, version, moneda, notas });
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">Duplicar cotización</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Copia de: <span className="font-semibold text-slate-600">{source.cliente} — {MESES[source.mes - 1]} {source.anio} v{source.version}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <i className="ri-close-line" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Info box */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
            <div className="flex items-start gap-2">
              <div className="w-4 h-4 flex items-center justify-center mt-0.5 flex-shrink-0">
                <i className="ri-information-line text-emerald-600 text-sm" />
              </div>
              <p className="text-xs text-emerald-700 leading-relaxed">
                Se copiarán todos los subprocesos, multiplicadores y valores dinámicos de la cotización original. La nueva cotización quedará en estado <strong>Borrador</strong>.
              </p>
            </div>
          </div>

          {/* Período destino */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Mes destino</label>
              <select
                value={mes}
                onChange={e => setMes(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 text-slate-700 cursor-pointer"
              >
                {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Año</label>
              <select
                value={anio}
                onChange={e => setAnio(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 text-slate-700 cursor-pointer"
              >
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Versión</label>
              <input
                type="number"
                value={version}
                onChange={e => setVersion(Math.max(1, Number(e.target.value)))}
                min={1}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 text-slate-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Moneda</label>
            <select
              value={moneda}
              onChange={e => setMoneda(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 text-slate-700 cursor-pointer"
            >
              {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notas (opcional)</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Ej: Ajuste de tarifas Q2..."
              rows={2}
              maxLength={500}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 text-slate-700 placeholder-slate-300 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <i className="ri-file-copy-line" />
              )}
              {loading ? 'Duplicando...' : 'Duplicar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
