import { useState, useRef, useCallback, DragEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { parseSlotsExcel, SLOTS_KEY_COLUMNS } from '@/lib/slotsMasivoExcelParser';
import type { MasivoParseResult } from '@/lib/slotsMasivoExcelParser';

interface Props { onClose: () => void; onSuccess: () => void; }
type Step = 'select' | 'preview' | 'uploading' | 'done';

export default function SlotsExcelUploadModal({ onClose, onSuccess }: Props) {
  const [step, setStep]           = useState<Step>('select');
  const [dragging, setDragging]   = useState(false);
  const [parsed, setParsed]       = useState<MasivoParseResult | null>(null);
  const [fileName, setFileName]   = useState('');
  const [uploadError, setUploadError] = useState('');
  const [progress, setProgress]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) { setParsed({ headers:[], batches:[], totalRows:0, previewRows:[], errors:['Solo .xlsx o .xls'] }); setFileName(file.name); setStep('preview'); return; }
    setFileName(file.name);
    const result = parseSlotsExcel(await file.arrayBuffer());
    setParsed(result);
    setStep('preview');
  }, []);

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) await processFile(f);
  }, [processFile]);

  const handleUpload = async () => {
    if (!parsed || parsed.errors.length > 0 || parsed.totalRows === 0) return;
    setStep('uploading'); setUploadError('');
    try {
      setProgress('Limpiando datos anteriores...');
      await supabase.from('conteo_slots_raw').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      for (let i = 0; i < parsed.batches.length; i++) {
        setProgress(`Subiendo lote ${i + 1} de ${parsed.batches.length}...`);
        const rows = parsed.batches[i].map(raw => ({ raw_data: raw, mes: null, anio: null }));
        const { error } = await supabase.from('conteo_slots_raw').insert(rows);
        if (error) throw new Error(`Error en lote ${i + 1}: ${error.message}`);
      }
      setStep('done');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error desconocido.');
      setStep('preview');
    }
  };

  const hasErrors = (parsed?.errors.length ?? 0) > 0 || (parsed?.totalRows ?? 0) === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Cargar datos — Conteo de Slots</h2>
            <p className="text-xs text-slate-400 mt-0.5">Reemplaza todos los datos existentes con los del nuevo archivo.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"><i className="ri-close-line text-lg" /></button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">
          {step === 'select' && (
            <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop} onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-all ${dragging ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-cyan-50"><i className="ri-layout-grid-line text-3xl text-cyan-500" /></div>
              <div className="text-center"><p className="text-sm font-medium text-slate-700">Arrastra tu archivo Excel aquí</p><p className="text-xs text-slate-400 mt-1">.xlsx / .xls</p></div>
            </div>
          )}
          {step === 'preview' && (
            <div className="space-y-4">
              {fileName && <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg"><i className="ri-file-excel-2-line text-cyan-500" /><span className="text-sm text-slate-600 truncate">{fileName}</span></div>}
              {hasErrors && <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">{parsed?.errors.map((e, i) => <p key={i} className="text-xs text-rose-600">{e}</p>)}</div>}
              {!hasErrors && parsed && (
                <div className="space-y-3">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
                    <i className="ri-alert-line text-amber-500 mt-0.5 flex-shrink-0"/>
                    <p className="text-xs text-amber-700">La carga <strong>reemplaza todos los datos existentes</strong>. Los datos anteriores serán eliminados antes de insertar los nuevos.</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center"><p className="text-xl font-bold text-slate-700">{parsed.totalRows.toLocaleString('es-CO')}</p><p className="text-xs text-slate-500">Slots</p></div>
                    <div className="bg-cyan-50 border border-cyan-100 rounded-lg p-3 text-center"><p className="text-xl font-bold text-cyan-700">{parsed.headers.length}</p><p className="text-xs text-cyan-600">Columnas</p></div>
                    <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-center"><p className="text-xl font-bold text-amber-700">{parsed.batches.length}</p><p className="text-xs text-amber-600">Lotes</p></div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1.5">Columnas detectadas — en azul las clave:</p>
                    <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">{parsed.headers.map(h => <span key={h} className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${SLOTS_KEY_COLUMNS.includes(h) ? 'bg-cyan-100 text-cyan-700 font-medium border border-cyan-200' : 'bg-slate-100 text-slate-600'}`}>{h}</span>)}</div>
                  </div>
                </div>
              )}
              {uploadError && <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{uploadError}</p>}
            </div>
          )}
          {step === 'uploading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-12 h-12 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-600">Procesando datos...</p>
              {progress && <p className="text-xs text-slate-400 text-center">{progress}</p>}
            </div>
          )}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-cyan-100"><i className="ri-check-line text-3xl text-cyan-600" /></div>
              <div className="text-center"><p className="text-sm font-semibold text-slate-800">Datos cargados correctamente</p><p className="text-xs text-slate-400 mt-1">{parsed?.totalRows.toLocaleString('es-CO')} slots guardados.</p></div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
          {step === 'select' && <><button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer">Cancelar</button><button onClick={() => inputRef.current?.click()} className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded-lg cursor-pointer">Seleccionar archivo</button></>}
          {step === 'preview' && <><button onClick={() => { setParsed(null); setFileName(''); setUploadError(''); setStep('select'); }} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer">Cambiar archivo</button><button disabled={hasErrors} onClick={handleUpload} className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg cursor-pointer">Confirmar y subir</button></>}
          {step === 'done' && <button onClick={() => { onSuccess(); onClose(); }} className="ml-auto px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded-lg cursor-pointer">Ver datos</button>}
        </div>
      </div>
    </div>
  );
}
