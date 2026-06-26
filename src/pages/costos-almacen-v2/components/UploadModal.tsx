import { useState, useRef, useCallback, type DragEvent } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

// Change this to match your Supabase table name.
// Required columns: id UUID (PK), raw_data JSONB, created_at TIMESTAMPTZ
export const V2_TABLE_NAME = 'costos_almacen_v2_data';
export const V2_COL_CONFIG_KEY = 'costos_almacen_v2_col_config';
const BATCH_SIZE = 1000;

export interface ExtraCol { key: string; label: string; }

export interface ColConfig {
  zonaCol: string;
  tipoCol: string;
  ubicacionCol: string;
  articuloCol: string;
  companiaCol: string;
  descripcionCol: string;
  extraCols: ExtraCol[];
  uploadedAt: string;
  totalRows: number;
}

interface Props {
  onClose: () => void;
  onSuccess: (config: ColConfig) => void;
}

type Step = 'select' | 'map' | 'uploading' | 'done';

function cellVal(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function autoFind(headers: string[], candidates: string[]): string {
  const norm = (s: string) =>
    String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  for (const h of headers) {
    const nh = norm(h);
    if (candidates.some(c => nh === norm(c) || nh.includes(norm(c)))) return h;
  }
  return '';
}

export default function V2UploadModal({ onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('select');
  const [dragging, setDragging] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [batches, setBatches] = useState<Record<string, unknown>[][]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  const [zonaCol, setZonaCol] = useState('');
  const [tipoCol, setTipoCol] = useState('');
  const [ubicacionCol, setUbicacionCol] = useState('');
  const [articuloCol, setArticuloCol] = useState('');
  const [companiaCol, setCompaniaCol] = useState('');
  const [descripcionCol, setDescripcionCol] = useState('');
  const [extraSelected, setExtraSelected] = useState<Set<string>>(new Set());
  const [extraLabels, setExtraLabels] = useState<Record<string, string>>({});

  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) { setError('Solo .xlsx o .xls'); return; }
    setFileName(file.name);
    setError('');

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });

    if (aoa.length < 2) { setError('El archivo necesita al menos una fila de datos'); return; }

    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(aoa.length, 10); i++) {
      if ((aoa[i] as unknown[]).filter(c => c !== null && c !== '').length >= 2) { headerRowIdx = i; break; }
    }
    if (headerRowIdx < 0) { setError('No se encontró fila de encabezados'); return; }

    const headerRow = aoa[headerRowIdx] as unknown[];
    const hdrs: string[] = [];
    const counts = new Map<string, number>();
    for (let i = 0; i < headerRow.length; i++) {
      let h = String(headerRow[i] ?? '').trim() || `Col_${i + 1}`;
      const n = counts.get(h) ?? 0;
      if (n > 0) h = `${h}_${n + 1}`;
      counts.set(h.split('_').slice(0, -1).join('_') || h, (n || 0) + 1);
      hdrs.push(h);
    }

    const allBatches: Record<string, unknown>[][] = [];
    let current: Record<string, unknown>[] = [];
    let total = 0;
    for (let i = headerRowIdx + 1; i < aoa.length; i++) {
      const row = aoa[i] as unknown[];
      if (!row.some(c => c !== null && c !== '')) continue;
      const obj: Record<string, unknown> = {};
      for (let j = 0; j < hdrs.length; j++) obj[hdrs[j]] = cellVal(row[j]);
      current.push(obj);
      if (current.length >= BATCH_SIZE) { allBatches.push(current); current = []; }
      total++;
    }
    if (current.length) allBatches.push(current);

    setHeaders(hdrs);
    setBatches(allBatches);
    setTotalRows(total);

    setZonaCol(autoFind(hdrs, ['zona almacenaje', 'zonaalmacenaje', 'zona_almacenaje', 'zona']));
    setTipoCol(autoFind(hdrs, ['tipo ubicacion', 'tipo_ubicacion', 'tipoulbicacion', 'tipo']));
    setUbicacionCol(autoFind(hdrs, ['ubicacion', 'ubicaciones', 'id almacenamiento', 'id_almacenamiento']));
    setArticuloCol(autoFind(hdrs, ['articulo', 'id articulo', 'id_articulo', 'sku', 'codigo', 'cod']));
    setCompaniaCol(autoFind(hdrs, ['compania', 'cia', 'empresa', 'cliente']));
    setDescripcionCol(autoFind(hdrs, ['descripcion', 'description', 'desc', 'nombre']));

    setStep('map');
  }, []);

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) await processFile(f);
  }, [processFile]);

  const handleUpload = async () => {
    if (!zonaCol || !tipoCol || !ubicacionCol) {
      setError('Zona, Tipo y Ubicación son obligatorios');
      return;
    }
    setStep('uploading'); setError('');
    try {
      setProgress('Limpiando datos anteriores...');
      await supabase.from(V2_TABLE_NAME).delete().neq('id', '00000000-0000-0000-0000-000000000000');

      for (let i = 0; i < batches.length; i++) {
        setProgress(`Subiendo lote ${i + 1} de ${batches.length}...`);
        const rows = batches[i].map(raw => ({ raw_data: raw }));
        const { error: err } = await supabase.from(V2_TABLE_NAME).insert(rows);
        if (err) throw new Error(`Lote ${i + 1}: ${err.message}`);
      }

      const config: ColConfig = {
        zonaCol, tipoCol, ubicacionCol, articuloCol, companiaCol, descripcionCol,
        extraCols: [...extraSelected].map(k => ({ key: k, label: extraLabels[k]?.trim() || k })),
        uploadedAt: new Date().toISOString(),
        totalRows,
      };
      localStorage.setItem(V2_COL_CONFIG_KEY, JSON.stringify(config));
      setStep('done');
      onSuccess(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setStep('map');
    }
  };

  const coreCols = new Set([zonaCol, tipoCol, ubicacionCol, articuloCol, companiaCol, descripcionCol].filter(Boolean));
  const requiredMapped = !!(zonaCol && tipoCol && ubicacionCol);

  const ColSelect = ({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500">{label}{required && <span className="text-rose-400 ml-0.5">*</span>}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400">
        <option value="">— ninguna —</option>
        {headers.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4 max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Cargar datos — Costos Almacén V2</h2>
            <p className="text-xs text-slate-400 mt-0.5">Sin límite de columnas ni filas · Selecciona qué columna es cada campo después de cargar</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">

          {step === 'select' && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-3 cursor-pointer transition-all ${dragging ? 'border-teal-400 bg-teal-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
            >
              <div className="w-16 h-16 flex items-center justify-center rounded-full bg-teal-50">
                <i className="ri-file-excel-2-line text-3xl text-teal-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">Arrastra tu archivo Excel aquí</p>
                <p className="text-xs text-slate-400 mt-1">.xlsx / .xls — todas las columnas, sin límite de filas</p>
              </div>
            </div>
          )}

          {step === 'map' && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-600">
                <i className="ri-file-excel-2-line text-teal-500" />
                <span className="font-medium truncate">{fileName}</span>
                <span className="ml-auto text-slate-400 text-xs whitespace-nowrap">{totalRows.toLocaleString('es-CO')} filas · {headers.length} columnas</span>
              </div>

              {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 px-3 py-2 rounded-lg">{error}</p>}

              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Mapeo de columnas</p>
                <div className="grid grid-cols-2 gap-3">
                  <ColSelect label="Zona Almacenaje" value={zonaCol} onChange={setZonaCol} required />
                  <ColSelect label="Tipo Ubicación" value={tipoCol} onChange={setTipoCol} required />
                  <ColSelect label="Ubicación" value={ubicacionCol} onChange={setUbicacionCol} required />
                  <ColSelect label="Artículo / SKU" value={articuloCol} onChange={setArticuloCol} />
                  <ColSelect label="Compañía / Cliente" value={companiaCol} onChange={setCompaniaCol} />
                  <ColSelect label="Descripción" value={descripcionCol} onChange={setDescripcionCol} />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Columnas adicionales a mostrar
                  <span className="ml-2 text-slate-400 font-normal normal-case">({extraSelected.size} seleccionadas)</span>
                </p>
                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  {headers.filter(h => !coreCols.has(h)).length === 0 && (
                    <p className="text-xs text-slate-400 px-3 py-2">No hay columnas adicionales disponibles</p>
                  )}
                  {headers.filter(h => !coreCols.has(h)).map(h => (
                    <label key={h} className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={extraSelected.has(h)}
                        onChange={e => {
                          const next = new Set(extraSelected);
                          if (e.target.checked) next.add(h); else next.delete(h);
                          setExtraSelected(next);
                        }}
                        className="rounded accent-teal-500 w-4 h-4 flex-shrink-0"
                      />
                      <span className="text-xs text-slate-600 flex-1 truncate" title={h}>{h}</span>
                      {extraSelected.has(h) && (
                        <input
                          type="text"
                          placeholder="Etiqueta (opcional)"
                          value={extraLabels[h] || ''}
                          onChange={e => setExtraLabels(prev => ({ ...prev, [h]: e.target.value }))}
                          onClick={e => e.stopPropagation()}
                          className="border border-slate-200 rounded px-2 py-1 text-xs w-36 text-slate-700 focus:outline-none focus:border-teal-400"
                        />
                      )}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'uploading' && (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="w-12 h-12 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-600">Procesando datos...</p>
              {progress && <p className="text-xs text-slate-400">{progress}</p>}
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-teal-100">
                <i className="ri-check-line text-3xl text-teal-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800">Datos cargados correctamente</p>
                <p className="text-xs text-slate-400 mt-1">{totalRows.toLocaleString('es-CO')} filas guardadas</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) { processFile(f); e.target.value = ''; } }} />

          {step === 'select' && (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer">Cancelar</button>
              <button onClick={() => inputRef.current?.click()} className="px-5 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-lg cursor-pointer">
                Seleccionar archivo
              </button>
            </>
          )}
          {step === 'map' && (
            <>
              <button onClick={() => { setStep('select'); setError(''); setBatches([]); setHeaders([]); }} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer">
                Cambiar archivo
              </button>
              <button disabled={!requiredMapped} onClick={handleUpload}
                className="px-5 py-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg cursor-pointer">
                Confirmar y subir
              </button>
            </>
          )}
          {step === 'done' && (
            <button onClick={onClose} className="ml-auto px-5 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-lg cursor-pointer">
              Ver datos
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
